import { Server as HttpServer, IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { URL } from 'url'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'
import { RoomManager } from '../services/RoomManager.js'
import { ServerTelemetrySampler } from '../services/ServerTelemetrySampler.js'
import {
  INativeParticipant,
  ParticipantRole,
  SignalingIncomingMessage,
  SignalingOutgoingMessage,
  SignalingIceServer,
} from '../types/native.types.js'
import { ClassroomSession } from '../../models/ClassroomSession.js'
import { SessionSourceAdapter } from '../../adapters/SessionSourceAdapter.js'
import { User } from '../../../../core/models/User.js'
import { logger } from '../../../../core/utils/logger.js'

interface AuthenticatedSocket extends WebSocket {
  isAlive: boolean
  peerId?: string
  roomId?: string
  userId?: string
  sessionKey?: string
  name?: string
  role?: ParticipantRole
}

export class NativeSignalingServer {
  private static instance: NativeSignalingServer
  private wss: WebSocketServer
  private clients = new Map<string, AuthenticatedSocket>() // peerId -> socket

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false, // Disable compression to avoid frame corruption across proxies
    })

    // Handle WebSocket HTTP upgrade requests strictly on /api/classroom/native/ws
    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      try {
        const host = request.headers.host || 'localhost'
        const pathname = request.url ? new URL(request.url, `http://${host}`).pathname : ''

        if (pathname === '/api/classroom/native/ws' || pathname === '/api/classroom/native/ws/') {
          this.wss.handleUpgrade(request, socket, head, ws => {
            this.wss.emit('connection', ws, request)
          })
        }
      } catch (err) {
        logger.error('[Signaling] Upgrade error:', err)
      }
    })

    this.wss.on('connection', (ws: AuthenticatedSocket, request: IncomingMessage) => {
      this.handleConnection(ws, request)
    })

    // Heartbeat & Room Timer checker interval (every 10 seconds)
    const interval = setInterval(() => {
      const now = Date.now()
      this.wss.clients.forEach(wsClient => {
        const client = wsClient as AuthenticatedSocket
        if (!client.isAlive) {
          logger.warn(`[Signaling] Client ${client.peerId || 'unknown'} inactive, terminating`)
          this.handleDisconnect(client)
          return client.terminate()
        }
        client.isAlive = false
        try {
          client.ping()
        } catch (e) {
          // ignore
        }
      })

      // Check 5-minute warning for rooms nearing completion
      RoomManager.getRooms().forEach((room, rId) => {
        if (room.endsAt && room.participants.size > 0) {
          const remainingMs = room.endsAt - now
          if (remainingMs <= 5 * 60 * 1000 && remainingMs > 0 && !room.endWarningSent) {
            room.endWarningSent = true
            this.broadcastToRoom(rId, '', {
              type: 'class_end_warning',
              roomId: rId,
              payload: {
                remainingMinutes: 5,
                remainingSeconds: Math.ceil(remainingMs / 1000),
                message: 'تنها ۵ دقیقه تا پایان کلاس آنلاین باقی مانده است ⏳',
              },
            })
          }
        }
      })
    }, 10000)

    this.wss.on('close', () => {
      clearInterval(interval)
    })

    logger.info('🚀 Native WebRTC WebSocket Signaling Server initialized on /api/classroom/native/ws')
  }

  static init(server: HttpServer): NativeSignalingServer {
    if (!this.instance) {
      this.instance = new NativeSignalingServer(server)
    }
    return this.instance
  }

  static getInstance(): NativeSignalingServer {
    return this.instance
  }

  private async handleConnection(ws: AuthenticatedSocket, request: IncomingMessage) {
    ws.isAlive = true
    ws.on('pong', () => {
      ws.isAlive = true
    })

    const host = request.headers.host || 'localhost'
    const parsedUrl = new URL(request.url || '', `http://${host}`)
    const token = parsedUrl.searchParams.get('token')
    const ticketCode = parsedUrl.searchParams.get('ticket')

    ws.on('message', async (data: any) => {
      ws.isAlive = true
      try {
        const message: SignalingIncomingMessage = JSON.parse(data.toString())
        await this.handleMessage(ws, message, token, ticketCode)
      } catch (err: any) {
        logger.error('[Signaling] Failed to process message:', err)
        this.sendError(ws, 'MALFORMED_MESSAGE', 'قالب پیام ارسالی نامعتبر است')
      }
    })

    ws.on('close', () => {
      this.handleDisconnect(ws)
    })

    ws.on('error', err => {
      logger.error(`[Signaling] Socket error on peer ${ws.peerId}:`, err)
    })
  }

  private async handleMessage(
    ws: AuthenticatedSocket,
    msg: SignalingIncomingMessage,
    defaultToken: string | null,
    defaultTicket: string | null
  ) {
    if (msg.type === 'ping') {
      this.sendMessage(ws, { type: 'pong', timestamp: Date.now() })
      return
    }

    const roomId = msg.type === 'join_room' ? (msg.roomId || ws.roomId) : (ws.roomId || msg.roomId)
    if (!roomId) {
      return this.sendError(ws, 'MISSING_ROOM_ID', 'شناسه کلاس مشخص نشده است')
    }

    ServerTelemetrySampler.recordRoomWs(roomId, 'in', 1)

    switch (msg.type) {
      case 'join_room': {
        const token = msg.token || defaultToken
        const ticketCode = msg.ticketCode || defaultTicket
        await this.handleJoinRoom(
          ws,
          roomId,
          token,
          ticketCode,
          msg.displayName,
          msg.requestedRole,
          msg.attendeeKey,
          msg.formAnswers
        )
        break
      }

      case 'offer': {
        if (!ws.peerId || ws.roomId !== roomId) return
        if (!msg.targetPeerId || !msg.sdp) return
        this.relayMessage(roomId, ws.peerId, msg.targetPeerId, 'offer', { sdp: msg.sdp })
        break
      }

      case 'answer': {
        if (!ws.peerId || ws.roomId !== roomId) return
        if (!msg.targetPeerId || !msg.sdp) return
        this.relayMessage(roomId, ws.peerId, msg.targetPeerId, 'answer', { sdp: msg.sdp })
        break
      }

      case 'ice_candidate': {
        if (!ws.peerId || ws.roomId !== roomId) return
        if (!msg.targetPeerId || !msg.candidate) return
        this.relayMessage(roomId, ws.peerId, msg.targetPeerId, 'ice_candidate', { candidate: msg.candidate })
        break
      }

      case 'set_microphone': {
        if (!ws.peerId || ws.roomId !== roomId) return
        this.handleSetMicrophone(ws, roomId, !!msg.enabled)
        break
      }

      case 'set_camera': {
        if (!ws.peerId || ws.roomId !== roomId) return
        this.handleSetCamera(ws, roomId, !!msg.enabled)
        break
      }

      case 'set_screen_share': {
        if (!ws.peerId || ws.roomId !== roomId) return
        this.handleSetScreenShare(ws, roomId, !!msg.enabled)
        break
      }

      case 'whiteboard_action': {
        if (!ws.peerId || ws.roomId !== roomId) return
        this.handleWhiteboardAction(ws, roomId, msg)
        break
      }

      case 'chat_message': {
        if (!ws.peerId || ws.roomId !== roomId) return
        this.handleChatMessage(ws, roomId, msg)
        break
      }

      case 'teacher_set_permission': {
        if (!this.isManagerSocket(ws, roomId)) {
          return this.sendError(ws, 'PERMISSION_DENIED', 'تنها مدیر جلسه امکان تغییر دسترسی‌ها را دارد')
        }
        if (!msg.targetPeerId) return
        this.handleTeacherSetPermission(roomId, msg.targetPeerId, !!msg.micBlocked)
        break
      }

      case 'teacher_set_screen_share_permission': {
        if (!this.isManagerSocket(ws, roomId)) {
          return this.sendError(ws, 'PERMISSION_DENIED', 'تنها مدیر جلسه امکان تغییر دسترسی‌ها را دارد')
        }
        if (!msg.targetPeerId) return
        this.handleTeacherSetScreenSharePermission(roomId, msg.targetPeerId, !!msg.allowed)
        break
      }

      case 'teacher_mute_all': {
        if (!this.isManagerSocket(ws, roomId)) {
          return this.sendError(ws, 'PERMISSION_DENIED', 'تنها مدیر جلسه امکان قطع صدای همه را دارد')
        }
        this.handleTeacherMuteAll(roomId)
        break
      }

      case 'teacher_remove_participant': {
        if (!this.isManagerSocket(ws, roomId)) {
          return this.sendError(ws, 'PERMISSION_DENIED', 'تنها مدیر جلسه امکان اخراج اعضا را دارد')
        }
        if (!msg.targetPeerId) return
        this.handleTeacherRemoveParticipant(roomId, msg.targetPeerId)
        break
      }

      case 'teacher_end_room': {
        if (!this.isManagerSocket(ws, roomId)) {
          return this.sendError(ws, 'PERMISSION_DENIED', 'تنها مدیر جلسه امکان خاتمه جلسه را دارد')
        }
        this.handleTeacherEndRoom(roomId, ws)
        break
      }

      case 'start_recording': {
        if (!ws.peerId || ws.roomId !== roomId) return
        this.handleStartRecording(ws, roomId)
        break
      }

      case 'stop_recording': {
        if (!ws.peerId || ws.roomId !== roomId) return
        this.handleStopRecording(ws, roomId)
        break
      }

      case 'raise_hand': {
        if (!ws.peerId || ws.roomId !== roomId) return
        const raised = typeof msg.enabled === 'boolean' ? msg.enabled : true
        if (RoomManager.setParticipantHandRaised(roomId, ws.peerId, raised)) {
          this.broadcastToRoom(roomId, null, {
            type: 'hand_raise_changed',
            roomId,
            payload: { peerId: ws.peerId, raised },
          })
        }
        break
      }

      case 'grant_speaker':
      case 'revoke_speaker': {
        if (!this.isManagerSocket(ws, roomId)) {
          return this.sendError(ws, 'PERMISSION_DENIED', 'تنها مدیران امکان مدیریت سخنرانان را دارند')
        }
        if (!msg.targetPeerId) return
        const isSpeaker = msg.type === 'grant_speaker'
        const updated = RoomManager.setParticipantSpeaker(roomId, msg.targetPeerId, isSpeaker)
        if (updated) {
          this.broadcastToRoom(roomId, null, {
            type: 'speaker_status_changed',
            roomId,
            payload: {
              peerId: msg.targetPeerId,
              isSpeaker,
              micState: updated.micState,
              cameraEnabled: updated.cameraEnabled,
              handRaised: updated.handRaised,
            },
          })
        }
        break
      }

      case 'grant_moderator':
      case 'revoke_moderator': {
        if (!this.isManagerSocket(ws, roomId)) {
          return this.sendError(ws, 'PERMISSION_DENIED', 'تنها مدیر جلسه امکان اعطای دسترسی مدیریت را دارد')
        }
        if (!msg.targetPeerId) return
        const isModerator = msg.type === 'grant_moderator'
        const updated = RoomManager.setParticipantModerator(roomId, msg.targetPeerId, isModerator)
        if (updated) {
          this.broadcastToRoom(roomId, null, {
            type: 'moderator_status_changed',
            roomId,
            payload: {
              peerId: msg.targetPeerId,
              isModerator,
              isSpeaker: updated.isSpeaker,
              micState: updated.micState,
              cameraEnabled: updated.cameraEnabled,
            },
          })
          // Send live attendees & form answers snapshot immediately if promoted to Manager
          if (isModerator) {
            const targetWs = this.clients.get(msg.targetPeerId)
            if (targetWs) {
              this.sendAttendeesSnapshotToManagers(roomId, targetWs)
            }
          }
        }
        break
      }

      case 'create_poll': {
        if (!this.isManagerSocket(ws, roomId) || !ws.peerId) {
          return this.sendError(ws, 'PERMISSION_DENIED', 'تنها مدیر جلسه امکان ساخت نظرسنجی را دارد')
        }
        const poll = RoomManager.createPoll(
          roomId,
          { peerId: ws.peerId, name: ws.name || 'مدیر' },
          {
            question: msg.payload?.question || msg.text || '',
            options: Array.isArray(msg.payload?.options) ? msg.payload.options : [],
            allowMultiple: !!msg.payload?.allowMultiple,
          }
        )
        if (!poll) {
          return this.sendError(ws, 'INVALID_POLL', 'سوال نظرسنجی و حداقل ۲ گزینه الزامی است')
        }
        this.broadcastPollsToRoom(roomId)
        break
      }

      case 'vote_poll': {
        if (!ws.peerId || ws.roomId !== roomId) return
        const room = RoomManager.getRoom(roomId)
        const p = room?.participants.get(ws.peerId)
        const voterKey = p?.attendeeKey || ws.userId || ws.peerId
        const pollId = msg.payload?.pollId
        const optionIds = Array.isArray(msg.payload?.optionIds) ? msg.payload.optionIds : []
        if (pollId && RoomManager.votePoll(roomId, pollId, voterKey, optionIds)) {
          this.broadcastPollsToRoom(roomId)
        }
        break
      }

      case 'close_poll': {
        if (!this.isManagerSocket(ws, roomId)) {
          return this.sendError(ws, 'PERMISSION_DENIED', 'تنها مدیر جلسه امکان بستن نظرسنجی را دارد')
        }
        const pollId = msg.payload?.pollId
        if (pollId && RoomManager.closePoll(roomId, pollId)) {
          this.broadcastPollsToRoom(roomId)
        }
        break
      }

      case 'leave_room': {
        this.handleDisconnect(ws)
        break
      }

      default:
        logger.warn(`[Signaling] Unrecognized message type: ${(msg as any).type}`)
    }
  }

  private async handleJoinRoom(
    ws: AuthenticatedSocket,
    roomId: string,
    token?: string | null,
    ticketCode?: string | null,
    clientDisplayName?: string,
    requestedRole?: 'teacher' | 'student',
    attendeeKey?: string,
    formAnswers?: Record<string, any>
  ) {
    // Clean up previous peer state if this socket was already in a room
    if (ws.peerId && ws.roomId) {
      this.handleDisconnect(ws)
    }

    let matchedUiMode: 'online_class' | 'seminar' = 'online_class'
    let matchedSession: any = null
    // Resolve canonical roomId if caller passed a session _id, bookingId, or invite ticketCode as roomId
    if (mongoose.connection.readyState === 1) {
      try {
        if (mongoose.isValidObjectId(roomId)) {
          matchedSession = await ClassroomSession.findOne({ $or: [{ _id: roomId }, { bookingId: roomId }] }).lean()
        } else {
          matchedSession = await ClassroomSession.findOne({
            $or: [
              { roomName: roomId },
              { plugNmeetRoomId: roomId },
              { bookingCode: roomId },
              { 'inviteTickets.ticketCode': roomId },
            ],
          }).lean()
        }
        if (matchedSession) {
          if (!ticketCode && matchedSession.inviteTickets?.some((t: any) => t.ticketCode === roomId)) {
            ticketCode = roomId
          }
          if (matchedSession.uiMode === 'seminar') {
            matchedUiMode = 'seminar'
          }
          roomId = matchedSession.roomName || roomId
        }
      } catch (e) {}
    }

    const normalizedRoomLower = roomId.toLowerCase()
    const isExplicitTestRoom =
      !matchedSession &&
      (normalizedRoomLower === 'test-room' ||
        normalizedRoomLower.startsWith('test-') ||
        normalizedRoomLower.startsWith('demo-'))

    let authUser: { userId?: string; name: string; role: ParticipantRole } | null = null
    let sessionKey: string | undefined

    // Check explicit ticketCode first so personal links & host tickets bind their exact role/userId
    if (ticketCode && mongoose.connection.readyState === 1) {
      try {
        const sessionForTicket =
          matchedSession ||
          (await ClassroomSession.findOne({
            roomName: roomId,
            'inviteTickets.ticketCode': ticketCode,
          }).lean())
        const ticket = sessionForTicket?.inviteTickets?.find((t: any) => t.ticketCode === ticketCode)
        if (ticket) {
          const ticketUserId = ticket.userId ? ticket.userId.toString() : undefined
          let role = (ticket.role as ParticipantRole) || 'student'
          if (requestedRole === 'student') {
            role = 'student'
          }
          authUser = {
            userId: ticketUserId,
            name: clientDisplayName?.trim() || ticket.name || (role === 'teacher' ? 'استاد کلاس' : 'دانش‌آموز'),
            role,
          }
          sessionKey = ticketUserId ? `user:${ticketUserId}` : `ticket:${ticket.ticketCode}`
        } else if (!isExplicitTestRoom) {
          return this.sendError(ws, 'INVALID_TICKET', 'لینک یا بلیت ورود به کلاس نامعتبر است.')
        }
      } catch (err) {
        logger.warn('[Signaling] Error checking ticket:', err)
      }
    } else if (ticketCode && !isExplicitTestRoom) {
      return this.sendError(ws, 'INVALID_TICKET', 'لینک یا بلیت ورود به کلاس نامعتبر است.')
    }

    if (!authUser && token && !isExplicitTestRoom) {
      try {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'default-secret')
        const targetId = decoded.userId || decoded.id

        if (targetId && mongoose.isValidObjectId(targetId) && mongoose.connection.readyState === 1) {
          const dbUser = await User.findById(targetId).lean()
          if (dbUser) {
            const role = ((dbUser as any).role as ParticipantRole) || 'student'
            const name =
              clientDisplayName ||
              (dbUser as any).fullName ||
              `${(dbUser as any).firstName || ''} ${(dbUser as any).lastName || ''}`.trim() ||
              (dbUser as any).username ||
              'کاربر'
            authUser = { userId: (dbUser as any)._id.toString(), name, role }
          }
        }

        if (!authUser && decoded.role) {
          authUser = {
            userId: targetId,
            name: clientDisplayName || decoded.name || decoded.username || 'کاربر',
            role: decoded.role as ParticipantRole,
          }
        }

        if (authUser) {
          const authed = authUser
          if (matchedSession) {
            const isSessionTeacher = Boolean(matchedSession.teacherId && matchedSession.teacherId.toString() === authed.userId)
            const isSessionStudent = Boolean(
              (matchedSession.studentId && matchedSession.studentId.toString() === authed.userId) ||
              (matchedSession.invitedStudentIds || []).some((id: any) => id.toString() === authed.userId)
            )

            if (isSessionStudent || (requestedRole === 'student' && !isSessionTeacher)) {
              authed.role = 'student'
            } else if (authed.role === 'teacher' && matchedSession.teacherId && !isSessionTeacher) {
              authed.role = 'student'
            }
          }
          if (matchedSession?.sourceType === 'online_class_booking') {
            const bookingSource = matchedSession.bookingId
              ? await SessionSourceAdapter.resolveSource(matchedSession.bookingId.toString())
              : null
            const allowed =
              authed.role === 'admin' ||
              matchedSession.teacherId?.toString() === authed.userId ||
              matchedSession.studentId?.toString() === authed.userId ||
              (matchedSession.invitedStudentIds || []).some((id: any) => id.toString() === authed.userId) ||
              (bookingSource ? await bookingSource.canAccess(authed.userId || '', authed.role) : false)
            if (!allowed) {
              return this.sendError(ws, 'UNAUTHORIZED', 'شما مجاز به ورود به این کلاس آنلاین نیستید.')
            }
          }
          if (authed.userId) {
            sessionKey = `user:${authed.userId}`
          }
        }
      } catch (e) {
        logger.warn(`[Signaling] Token validation failed, falling back if possible`)
      }
    }

    if (!authUser && matchedSession?.sourceType === 'online_class_booking' && !isExplicitTestRoom) {
      return this.sendError(
        ws,
        'UNAUTHORIZED',
        'برای ورود به این کلاس آنلاین باید از طریق لینک اختصاصی خود یا اپلیکیشن وارد شوید.'
      )
    }

    const activeList = RoomManager.getActiveParticipantsList(roomId)
    const hasTeacher = activeList.some(p => p.role === 'teacher' || p.isTeacher)

    // Allow test rooms OR fallback guest entry so classroom never fails in testing
    const isTestRoom = isExplicitTestRoom || !authUser
    if (!authUser && isTestRoom) {
      let role: ParticipantRole = 'student'
      if (requestedRole === 'teacher') {
        role = 'teacher'
      } else if (requestedRole === 'student' || matchedUiMode === 'seminar') {
        // In seminar mode, public attendees always enter as audience/student unless presenting a host ticket
        role = 'student'
      } else {
        role = !hasTeacher ? 'teacher' : 'student'
      }

      const randomSuffix = Math.floor(100 + Math.random() * 900)
      authUser = {
        userId: `guest_${Date.now()}_${randomSuffix}`,
        name:
          clientDisplayName?.trim() ||
          (role === 'teacher' ? `مدرس (${randomSuffix})` : `شرکت‌کننده (${randomSuffix})`),
        role,
      }
      logger.info(`[Signaling] Joined room ${roomId} as ${authUser.name} (${authUser.role})`)
    }

    if (!authUser) {
      return this.sendError(ws, 'UNAUTHORIZED', 'احراز هویت انجام نشد.')
    }

    const room = await RoomManager.getOrCreateRoom(roomId)
    if (room.status === 'ended') {
      return this.sendError(ws, 'ROOM_ENDED', 'این جلسه به پایان رسیده است.')
    }

    // Last-device-wins: kick any older open socket belonging to the same user/ticket before teacher presence check
    if (sessionKey) {
      this.evictDuplicateSessions(roomId, sessionKey, ws, authUser.name)
    }

    const hasOtherTeacher = RoomManager.getActiveParticipantsList(roomId).some(
      p => p.role === 'teacher' || p.isTeacher
    )

    // Single teacher enforcement in interactive classes (multiple managers allowed in seminars)
    if (matchedUiMode !== 'seminar' && authUser.role === 'teacher' && hasOtherTeacher) {
      if (room.teacherId && room.teacherId !== authUser.userId) {
        authUser.role = 'student'
      } else {
        return this.sendError(
          ws,
          'TEACHER_ALREADY_PRESENT',
          'در حال حاضر یک معلم در کلاس حضور دارد و امکان ورود معلم دوم وجود ندارد.'
        )
      }
    }

    const isPrimaryManager = authUser.role === 'teacher' || authUser.role === 'admin'
    if (isPrimaryManager && !room.teacherId && authUser.userId) {
      room.teacherId = authUser.userId
    }

    const peerId = `p_${uuidv4().replace(/-/g, '').slice(0, 10)}`
    ws.peerId = peerId
    ws.roomId = roomId
    ws.userId = authUser.userId
    ws.sessionKey = sessionKey
    ws.name = authUser.name
    ws.role = authUser.role

    const effectiveUiMode = room.uiMode || matchedUiMode
    const isSeminarAudience = effectiveUiMode === 'seminar' && !isPrimaryManager
    const participant: INativeParticipant = {
      peerId,
      userId: authUser.userId,
      attendeeKey: attendeeKey?.trim() || undefined,
      name: authUser.name,
      role: authUser.role,
      micState: isSeminarAudience ? 'blocked' : 'disabled',
      cameraEnabled: false,
      screenShareEnabled: false,
      canShareScreen: isPrimaryManager || authUser.role === 'teacher' || authUser.role === 'admin',
      handRaised: false,
      isSpeaker: isPrimaryManager,
      isModerator: isPrimaryManager,
      connectionState: 'connected',
      joinedAt: Date.now(),
      isTeacher: isPrimaryManager,
    }

    const { added, autoStartedRecording } = RoomManager.addParticipant(roomId, participant, formAnswers)
    if (!added) {
      return this.sendError(ws, 'ROOM_FULL', 'ظرفیت جلسه تکمیل شده است.')
    }

    this.clients.set(peerId, ws)

    const existingParticipants = Array.from(room.participants.values()).filter(p => p.peerId !== peerId)
    const iceServers = this.getIceServers()
    const myVoterKey = participant.attendeeKey || participant.userId || participant.peerId

    this.sendMessage(ws, {
      type: 'room_joined',
      roomId,
      payload: {
        self: participant,
        participants: existingParticipants,
        iceServers,
        whiteboard: room.whiteboard,
        chatMessages: room.chatMessages || [],
        polls: RoomManager.serializePolls(room.polls, myVoterKey),
        attendees: isPrimaryManager ? RoomManager.getAttendanceSnapshot(roomId) : undefined,
        isTestRoom: room.isTestRoom,
        recording: this.serializeRecordingState(room),
        room: {
          roomId: room.roomId,
          title: room.title,
          uiMode: effectiveUiMode,
          status: room.status,
          maxParticipants: room.maxParticipants,
          isTestRoom: room.isTestRoom,
          scheduledAt: room.scheduledAt,
          effectiveStartAt: room.effectiveStartAt,
          endsAt: room.endsAt,
          durationMinutes: room.durationMinutes,
        },
        timer: {
          scheduledAt: room.scheduledAt,
          teacherJoinedAt: room.teacherJoinedAt,
          effectiveStartAt: room.effectiveStartAt,
          endsAt: room.endsAt,
          durationMinutes: room.durationMinutes || 90,
          extraMinutes: 5,
        },
        teacherPresence: {
          present: hasOtherTeacher || isPrimaryManager,
          teacherName: isPrimaryManager ? participant.name : undefined,
          lateThresholdMinutes: 30,
          autoCancelAt: room.scheduledAt ? room.scheduledAt + 30 * 60 * 1000 : undefined,
          scheduledAt: room.scheduledAt,
        },
      },
    })

    // If teacher joined, initialize or sync the room countdown timer
    if (participant.role === 'teacher') {
      if (!room.teacherJoinedAt) {
        room.teacherJoinedAt = Date.now()
        const scheduledMs = room.scheduledAt || Date.now()
        const effectiveStart = room.teacherJoinedAt < scheduledMs ? scheduledMs : room.teacherJoinedAt
        const totalDurationMs = ((room.durationMinutes || 90) + 5) * 60 * 1000
        room.effectiveStartAt = effectiveStart
        room.endsAt = effectiveStart + totalDurationMs
      }

      // Broadcast timer sync & teacher presence to all participants
      this.broadcastToRoom(roomId, '', {
        type: 'room_timer_sync',
        roomId,
        payload: {
          scheduledAt: room.scheduledAt,
          teacherJoinedAt: room.teacherJoinedAt,
          effectiveStartAt: room.effectiveStartAt,
          endsAt: room.endsAt,
          durationMinutes: room.durationMinutes || 90,
          extraMinutes: 5,
          teacherPresent: true,
          teacherName: participant.name,
        },
      })
      this.broadcastToRoom(roomId, '', {
        type: 'teacher_presence',
        roomId,
        payload: {
          present: true,
          teacherName: participant.name,
        },
      })
    } else if (!hasOtherTeacher) {
      // If student joined and no teacher is present yet, notify student
      this.sendMessage(ws, {
        type: 'teacher_presence',
        roomId,
        payload: {
          present: false,
          lateThresholdMinutes: 30,
          autoCancelAt: room.scheduledAt ? room.scheduledAt + 30 * 60 * 1000 : undefined,
          scheduledAt: room.scheduledAt,
          modalMessage:
            'معلم هنوز وارد کلاس نشده است. در صورتی که تا ۳۰ دقیقه پس از زمان شروع معلم حضور پیدا نکند، کلاس لغو شده و مبلغ پرداختی به صورت خودکار به کیف پول شما بازگردانده می‌شود.',
        },
      })
    }

    this.broadcastToRoom(roomId, peerId, {
      type: 'participant_joined',
      roomId,
      payload: { participant },
    })

    // Notify all active Managers in this seminar with updated attendance + form answers
    if (effectiveUiMode === 'seminar') {
      this.sendAttendeesSnapshotToManagers(roomId)
    }

    if (autoStartedRecording || room.recording.isRecording) {
      this.broadcastRecordingState(roomId)
    }

    logger.info(`[Signaling] ${participant.name} (${participant.role}) joined room ${roomId} as peer ${peerId}`)
  }

  public serializeRecordingState(room: any) {
    if (!room || !room.recording) return null
    return {
      isRecording: !!room.recording.isRecording,
      mode: room.recording.mode,
      status: room.recording.status,
      startedAt: room.recording.startedAt,
      endedAt: room.recording.endedAt,
      recorderPeerId: room.recording.recorderPeerId,
      videoUrl: room.recording.videoUrl,
      chunksCount: room.recording.chunksCount || 0,
      fileSize: room.recording.fileSize || 0,
      isTestRoom: !!room.isTestRoom,
    }
  }

  public broadcastRecordingState(roomId: string) {
    const room = RoomManager.getRoom(roomId) || RoomManager.getCompletedRoom(roomId)
    if (!room) return
    this.broadcastToRoom(roomId, null, {
      type: 'recording_state_changed',
      roomId,
      payload: this.serializeRecordingState(room),
    })
  }

  private handleStartRecording(ws: AuthenticatedSocket, roomId: string) {
    const room = RoomManager.getRoom(roomId)
    if (!room) return
    RoomManager.startRecording(roomId, room.isTestRoom ? 'manual_test' : 'auto', {
      peerId: ws.peerId,
      name: ws.name || 'کاربر',
      role: (ws.role as any) || 'teacher',
    })
    if (ws.peerId) {
      room.recording.recorderPeerId = ws.peerId
    }
    this.broadcastRecordingState(roomId)
  }

  private handleStopRecording(ws: AuthenticatedSocket, roomId: string) {
    const room = RoomManager.getRoom(roomId)
    if (!room) return
    RoomManager.stopRecording(roomId, {
      peerId: ws.peerId,
      name: ws.name || 'کاربر',
      role: (ws.role as any) || 'teacher',
    })
    this.broadcastRecordingState(roomId)
  }

  private handleSetMicrophone(ws: AuthenticatedSocket, roomId: string, enabled: boolean) {
    const peerId = ws.peerId
    if (!peerId) return

    const room = RoomManager.getRoom(roomId)
    const current = room?.participants.get(peerId)
    if (current && current.micState === 'blocked' && enabled) {
      return this.sendError(ws, 'MIC_BLOCKED', 'میکروفون شما توسط معلم قفل شده است.')
    }

    const newState = enabled ? 'enabled' : 'disabled'
    const updated = RoomManager.updateMicrophoneState(roomId, peerId, newState)
    if (updated) {
      this.broadcastToRoom(roomId, null, {
        type: 'microphone_state_changed',
        roomId,
        payload: { peerId, enabled: newState === 'enabled', micState: newState },
      })
    }
  }

  private handleSetCamera(ws: AuthenticatedSocket, roomId: string, enabled: boolean) {
    const peerId = ws.peerId
    if (!peerId) return
    const room = RoomManager.getRoom(roomId)

    // Enforce rule: At any time, only teacher and max ONE student camera can be active simultaneously
    if (enabled && ws.role !== 'teacher' && room) {
      const otherStudentWithCamera = Array.from(room.participants.values()).find(
        (p) => p.peerId !== peerId && !p.isTeacher && p.role !== 'teacher' && p.cameraEnabled
      )
      if (otherStudentWithCamera) {
        return this.sendError(
          ws,
          'CAMERA_LIMIT_REACHED',
          'در کلاس مجازی همزمان تنها دوربین معلم و یک دانش‌آموز می‌تواند فعال باشد.'
        )
      }
    }

    const updated = RoomManager.updateCameraState(roomId, peerId, enabled)
    if (updated) {
      this.broadcastToRoom(roomId, null, {
        type: 'camera_state_changed',
        roomId,
        payload: { peerId, enabled },
      })
    }
  }

  private handleSetScreenShare(ws: AuthenticatedSocket, roomId: string, enabled: boolean) {
    const peerId = ws.peerId
    if (!peerId) return
    const room = RoomManager.getRoom(roomId)
    const participant = room?.participants.get(peerId)
    if (!participant) return

    const isTeacher = participant.isTeacher || participant.role === 'teacher' || participant.role === 'admin' || participant.isModerator
    if (enabled && !isTeacher && !participant.canShareScreen) {
      return this.sendError(ws, 'PERMISSION_DENIED', 'اشتراک صفحه تنها با اجازه معلم امکان‌پذیر است.')
    }

    const updated = RoomManager.updateScreenShareState(roomId, peerId, enabled)
    if (updated) {
      this.broadcastToRoom(roomId, null, {
        type: 'screen_share_state_changed',
        roomId,
        payload: { peerId, enabled },
      })
    }
  }

  private handleTeacherSetScreenSharePermission(roomId: string, targetPeerId: string, allowed: boolean) {
    const updated = RoomManager.setParticipantScreenSharePermission(roomId, targetPeerId, allowed)
    if (updated) {
      this.broadcastToRoom(roomId, null, {
        type: 'screen_share_permission_changed',
        roomId,
        payload: { peerId: targetPeerId, canShareScreen: allowed },
      })
    }
  }

  private handleChatMessage(ws: AuthenticatedSocket, roomId: string, msg: SignalingIncomingMessage) {
    const room = RoomManager.getRoom(roomId)
    if (!room || !ws.peerId) return

    const text = (msg.text || msg.payload?.text || '').toString().trim()
    const fileUrl = msg.fileUrl || msg.payload?.fileUrl
    const fileName = msg.fileName || msg.payload?.fileName
    if (!text && !fileUrl) return

    const now = Date.now()
    const baseStart = room.recording?.startedAt || room.startedAt || room.createdAt
    const offsetMs = Math.max(0, now - baseStart)

    const chatMsg: any = {
      id: `msg_${now}_${Math.random().toString(36).slice(2, 7)}`,
      senderPeerId: ws.peerId,
      senderId: ws.peerId,
      senderName: ws.name || (ws.role === 'teacher' ? 'معلم' : 'دانش‌آموز'),
      senderRole: ws.role || 'student',
      text,
      message: text || (fileName ? `[فایل پیوست: ${fileName}]` : ''),
      fileUrl,
      fileName,
      timestamp: now,
      offsetMs,
    }

    RoomManager.appendChatMessage(roomId, {
      id: chatMsg.id,
      senderId: ws.peerId,
      senderName: chatMsg.senderName,
      senderRole: (ws.role === 'teacher' ? 'teacher' : 'student'),
      message: chatMsg.message,
      timestamp: now,
      offsetMs,
    })

    if (room.chatMessages.length > 200) {
      room.chatMessages = room.chatMessages.slice(-200)
    }

    this.broadcastToRoom(roomId, null, {
      type: 'chat_message',
      roomId,
      payload: chatMsg,
    })
  }

  private handleWhiteboardAction(ws: AuthenticatedSocket, roomId: string, msg: SignalingIncomingMessage) {
    const room = RoomManager.getRoom(roomId)
    if (!room || !ws.peerId) return

    const isTeacher = this.isManagerSocket(ws, roomId)
    const canDraw = isTeacher || room.whiteboard.allowStudentDraw
    const action = msg.action
    const payload = msg.payload || {}

    if (action === 'laser_move') {
      if (!canDraw) return
      this.broadcastToRoom(roomId, ws.peerId, {
        type: 'whiteboard_update',
        roomId,
        payload: {
          action: 'laser_move',
          peerId: ws.peerId,
          name: ws.name || (isTeacher ? 'معلم' : 'دانش‌آموز'),
          page: Number(payload.page) || room.whiteboard.currentPage,
          x: payload.x,
          y: payload.y,
          active: payload.active,
        },
      })
      return
    }

    if (action === 'draw_progress') {
      if (!canDraw || !payload.element) return
      this.broadcastToRoom(roomId, ws.peerId, {
        type: 'whiteboard_update',
        roomId,
        payload: {
          action: 'draw_progress',
          peerId: ws.peerId,
          page: Number(payload.page) || room.whiteboard.currentPage,
          element: payload.element,
        },
      })
      return
    }

    if (action === 'add_element') {
      if (!canDraw || !payload.element) return
      const page = Number(payload.page) || room.whiteboard.currentPage
      if (!room.whiteboard.pages[page]) {
        room.whiteboard.pages[page] = []
      }
      room.whiteboard.pages[page].push(payload.element)
      RoomManager.appendWhiteboardTimeline(roomId, 'add_element', {
        page,
        element: payload.element,
      })
      this.broadcastToRoom(roomId, null, {
        type: 'whiteboard_update',
        roomId,
        payload: {
          action: 'add_element',
          page,
          element: payload.element,
        },
      })
      return
    }

    if (action === 'erase_element') {
      if (!canDraw || !payload.elementId) return
      const page = Number(payload.page) || room.whiteboard.currentPage
      if (room.whiteboard.pages[page]) {
        room.whiteboard.pages[page] = room.whiteboard.pages[page].filter(
          (el: any) => el.id !== payload.elementId
        )
      }
      RoomManager.appendWhiteboardTimeline(roomId, 'erase_element', {
        page,
        elementId: payload.elementId,
      })
      this.broadcastToRoom(roomId, null, {
        type: 'whiteboard_update',
        roomId,
        payload: {
          action: 'erase_element',
          page,
          elementId: payload.elementId,
        },
      })
      return
    }

    if (action === 'undo') {
      if (!canDraw) return
      const page = Number(payload.page) || room.whiteboard.currentPage
      if (room.whiteboard.pages[page] && room.whiteboard.pages[page].length > 0) {
        room.whiteboard.pages[page].pop()
      }
      RoomManager.appendWhiteboardTimeline(roomId, 'undo', { page })
      this.broadcastToRoom(roomId, null, {
        type: 'whiteboard_update',
        roomId,
        payload: {
          action: 'sync_state',
          whiteboard: room.whiteboard,
        },
      })
      return
    }

    // Teacher-only board management actions
    if (!isTeacher) return

    if (action === 'clear_page') {
      const page = Number(payload.page) || room.whiteboard.currentPage
      room.whiteboard.pages[page] = []
      RoomManager.appendWhiteboardTimeline(roomId, 'clear_page', { page })
      RoomManager.appendRecordingLog(roomId, {
        type: 'whiteboard_action',
        actorId: ws.peerId,
        actorName: ws.name || 'استاد',
        actorRole: 'teacher',
        message: `تخته سفید صفحه ${page} پاک‌سازی شد`,
        metadata: { action: 'clear_page', page },
      })
      this.broadcastToRoom(roomId, null, {
        type: 'whiteboard_update',
        roomId,
        payload: {
          action: 'clear_page',
          page,
        },
      })
    } else if (action === 'change_page') {
      const maxPages = room.whiteboard.totalPages || 15
      const nextPage = Math.min(Math.max(Number(payload.page) || 1, 1), maxPages)
      room.whiteboard.currentPage = nextPage
      if (!room.whiteboard.pages[nextPage]) {
        room.whiteboard.pages[nextPage] = []
      }
      RoomManager.appendWhiteboardTimeline(roomId, 'change_page', { page: nextPage })
      RoomManager.appendRecordingLog(roomId, {
        type: 'whiteboard_action',
        actorId: ws.peerId,
        actorName: ws.name || 'استاد',
        actorRole: 'teacher',
        message: `صفحه تخته سفید به اسلاید ${nextPage} تغییر کرد`,
        metadata: { action: 'change_page', page: nextPage },
      })
      this.broadcastToRoom(roomId, null, {
        type: 'whiteboard_update',
        roomId,
        payload: {
          action: 'change_page',
          currentPage: nextPage,
          elements: room.whiteboard.pages[nextPage],
        },
      })
    } else if (action === 'set_grid') {
      room.whiteboard.gridMode = payload.gridMode || 'grid'
      RoomManager.appendWhiteboardTimeline(roomId, 'set_grid', { gridMode: room.whiteboard.gridMode })
      this.broadcastToRoom(roomId, null, {
        type: 'whiteboard_update',
        roomId,
        payload: {
          action: 'set_grid',
          gridMode: room.whiteboard.gridMode,
        },
      })
    } else if (action === 'toggle_student_draw') {
      room.whiteboard.allowStudentDraw = !!payload.allowStudentDraw
      RoomManager.appendRecordingLog(roomId, {
        type: 'permission_changed',
        actorId: ws.peerId,
        actorName: ws.name || 'استاد',
        actorRole: 'teacher',
        message: `دسترسی قلم تخته برای دانش‌آموزان ${room.whiteboard.allowStudentDraw ? 'فعال شد ✏️' : 'غیرفعال شد'}`,
      })
      this.broadcastToRoom(roomId, null, {
        type: 'whiteboard_update',
        roomId,
        payload: {
          action: 'toggle_student_draw',
          allowStudentDraw: room.whiteboard.allowStudentDraw,
        },
      })
    } else if (action === 'set_page_backgrounds') {
      if (!room.whiteboard.pageBackgrounds) {
        room.whiteboard.pageBackgrounds = {}
      }
      if (payload.backgrounds && typeof payload.backgrounds === 'object') {
        Object.assign(room.whiteboard.pageBackgrounds, payload.backgrounds)
      }
      if (payload.fileName !== undefined) {
        room.whiteboard.activeFileName = payload.fileName
      }
      if (payload.totalPages) {
        room.whiteboard.totalPages = Math.max(room.whiteboard.totalPages || 10, Number(payload.totalPages))
      }
      if (payload.currentPage) {
        room.whiteboard.currentPage = Number(payload.currentPage)
      }
      RoomManager.appendRecordingLog(roomId, {
        type: 'whiteboard_action',
        actorId: ws.peerId,
        actorName: ws.name || 'استاد',
        actorRole: 'teacher',
        message: `فایل آموزشی «${payload.fileName || 'اسلاید'}» روی تخته بارگذاری شد`,
        metadata: { fileName: payload.fileName },
      })
      this.broadcastToRoom(roomId, null, {
        type: 'whiteboard_update',
        roomId,
        payload: {
          action: 'sync_state',
          whiteboard: room.whiteboard,
        },
      })
    } else if (action === 'clear_background') {
      if (!room.whiteboard.pageBackgrounds) {
        room.whiteboard.pageBackgrounds = {}
      }
      if (payload.all) {
        room.whiteboard.pageBackgrounds = {}
        room.whiteboard.activeFileName = undefined
      } else {
        const page = Number(payload.page) || room.whiteboard.currentPage
        delete room.whiteboard.pageBackgrounds[page]
      }
      this.broadcastToRoom(roomId, null, {
        type: 'whiteboard_update',
        roomId,
        payload: {
          action: 'sync_state',
          whiteboard: room.whiteboard,
        },
      })
    }
  }

  private handleTeacherSetPermission(roomId: string, targetPeerId: string, micBlocked: boolean) {
    const room = RoomManager.getRoom(roomId)
    const target = room?.participants.get(targetPeerId)
    if (!target) return

    const newState = micBlocked ? 'blocked' : 'disabled'
    RoomManager.updateMicrophoneState(roomId, targetPeerId, newState)

    this.broadcastToRoom(roomId, null, {
      type: 'permission_state_changed',
      roomId,
      payload: { peerId: targetPeerId, micBlocked, micState: newState },
    })
  }

  private handleTeacherMuteAll(roomId: string) {
    const room = RoomManager.getRoom(roomId)
    if (!room) return

    for (const [pId, p] of room.participants.entries()) {
      if (!p.isTeacher && p.role !== 'teacher') {
        RoomManager.updateMicrophoneState(roomId, pId, 'disabled')
        this.broadcastToRoom(roomId, null, {
          type: 'permission_state_changed',
          roomId,
          payload: { peerId: pId, micBlocked: true, micState: 'disabled' },
        })
      }
    }
  }

  private handleTeacherRemoveParticipant(roomId: string, targetPeerId: string) {
    const room = RoomManager.getRoom(roomId)
    const target = room?.participants.get(targetPeerId)
    if (target) {
      RoomManager.appendRecordingLog(roomId, {
        type: 'participant_removed',
        actorId: target.peerId,
        actorName: target.name,
        actorRole: target.role,
        message: `کاربر «${target.name}» توسط استاد از کلاس اخراج شد`,
      })
    }
    const targetWs = this.clients.get(targetPeerId)
    if (targetWs) {
      this.sendMessage(targetWs, {
        type: 'participant_removed',
        roomId,
        payload: { reason: 'شما توسط معلم از کلاس خارج شدید.' },
      })
      targetWs.close()
    }
    this.handleParticipantLeft(roomId, targetPeerId, 'REMOVED_BY_TEACHER')
  }

  private handleTeacherEndRoom(roomId: string, ws?: AuthenticatedSocket) {
    RoomManager.endRoom(roomId, {
      peerId: ws?.peerId,
      name: ws?.name || 'استاد',
      role: 'teacher',
    })

    this.broadcastToRoom(roomId, null, {
      type: 'room_ended',
      roomId,
      payload: { reason: 'کلاس توسط معلم به پایان رسید.' },
    })

    this.clients.forEach((socket, pId) => {
      if (socket.roomId === roomId) {
        socket.close()
        this.clients.delete(pId)
      }
    })
  }

  private evictDuplicateSessions(
    roomId: string,
    sessionKey: string,
    currentWs: AuthenticatedSocket,
    incomingName: string
  ) {
    for (const [existingPeerId, existingWs] of Array.from(this.clients.entries())) {
      if (existingWs !== currentWs && existingWs.roomId === roomId && existingWs.sessionKey === sessionKey) {
        RoomManager.appendRecordingLog(roomId, {
          type: 'participant_removed',
          actorId: existingPeerId,
          actorName: existingWs.name || incomingName,
          actorRole: existingWs.role || 'student',
          message: `اتصال قبلی «${existingWs.name || incomingName}» به دلیل ورود با دستگاه جدید قطع شد`,
        })
        this.sendMessage(existingWs, {
          type: 'participant_removed',
          roomId,
          payload: {
            code: 'DUPLICATE_DEVICE',
            reason: 'شما با دستگاه یا مرورگر دیگری وارد این کلاس شدید؛ اتصال این دستگاه قطع شد.',
          },
        })
        existingWs.peerId = undefined
        existingWs.roomId = undefined
        existingWs.sessionKey = undefined
        this.clients.delete(existingPeerId)
        this.handleParticipantLeft(roomId, existingPeerId, 'REPLACED_BY_NEW_DEVICE')
        try {
          existingWs.close(4001, 'DUPLICATE_DEVICE')
        } catch {}
      }
    }
  }

  private handleDisconnect(ws: AuthenticatedSocket) {
    const peerId = ws.peerId
    const roomId = ws.roomId
    if (peerId && roomId) {
      ws.peerId = undefined
      ws.roomId = undefined
      ws.sessionKey = undefined
      this.clients.delete(peerId)
      this.handleParticipantLeft(roomId, peerId, 'DISCONNECTED')
    }
  }

  private handleParticipantLeft(roomId: string, peerId: string, reason: string) {
    const removed = RoomManager.removeParticipant(roomId, peerId)
    if (removed) {
      this.broadcastToRoom(roomId, null, {
        type: 'participant_left',
        roomId,
        payload: { peerId, reason },
      })
      const room = RoomManager.getRoom(roomId)
      if (room && room.recording.isRecording) {
        this.broadcastRecordingState(roomId)
      }
      if (room?.uiMode === 'seminar') {
        this.sendAttendeesSnapshotToManagers(roomId)
      }
      logger.info(`[Signaling] Peer ${peerId} left room ${roomId} (reason: ${reason})`)
    }
  }

  private relayMessage(roomId: string, fromPeerId: string, targetPeerId: string, type: any, payload: any) {
    const targetSocket = this.clients.get(targetPeerId)
    if (targetSocket && targetSocket.roomId === roomId && targetSocket.readyState === WebSocket.OPEN) {
      this.sendMessage(targetSocket, {
        type,
        roomId,
        fromPeerId,
        targetPeerId,
        payload,
      })
    }
  }

  private isManagerSocket(ws: AuthenticatedSocket, roomId: string): boolean {
    if (!ws.peerId || ws.roomId !== roomId) return false
    if (ws.role === 'teacher' || ws.role === 'admin') return true
    const p = RoomManager.getRoom(roomId)?.participants.get(ws.peerId)
    return !!(p?.isModerator || p?.isTeacher)
  }

  private broadcastPollsToRoom(roomId: string) {
    const room = RoomManager.getRoom(roomId)
    if (!room) return
    this.clients.forEach((client, peerId) => {
      if (client.roomId === roomId && client.readyState === WebSocket.OPEN) {
        const p = room.participants.get(peerId)
        const voterKey = p?.attendeeKey || client.userId || peerId
        this.sendMessage(client, {
          type: 'polls_sync',
          roomId,
          payload: { polls: RoomManager.serializePolls(room.polls, voterKey) },
        })
      }
    })
  }

  private sendAttendeesSnapshotToManagers(roomId: string, singleTarget?: AuthenticatedSocket) {
    const attendees = RoomManager.getAttendanceSnapshot(roomId)
    const payload = { attendees }
    if (singleTarget && singleTarget.readyState === WebSocket.OPEN) {
      this.sendMessage(singleTarget, { type: 'seminar_attendees_sync', roomId, payload })
      return
    }
    this.clients.forEach((client) => {
      if (client.roomId === roomId && client.readyState === WebSocket.OPEN && this.isManagerSocket(client, roomId)) {
        this.sendMessage(client, { type: 'seminar_attendees_sync', roomId, payload })
      }
    })
  }

  private broadcastToRoom(roomId: string, excludePeerId: string | null, msg: SignalingOutgoingMessage) {
    const json = JSON.stringify({ ...msg, timestamp: Date.now() })
    let sentCount = 0
    this.clients.forEach((client, peerId) => {
      if (client.roomId === roomId && peerId !== excludePeerId && client.readyState === WebSocket.OPEN) {
        client.send(json)
        sentCount += 1
      }
    })
    if (sentCount > 0) {
      ServerTelemetrySampler.recordRoomWs(roomId, 'out', sentCount)
    }
  }

  private sendMessage(ws: WebSocket, msg: SignalingOutgoingMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ...msg, timestamp: Date.now() }))
    }
  }

  private sendError(ws: WebSocket, code: string, message: string) {
    this.sendMessage(ws, {
      type: 'error',
      payload: { code, message },
    })
  }

  public getIceServers(): SignalingIceServer[] {
    return [
      { urls: 'stun:193.242.208.157:3478' },
      { urls: 'stun:turn.kitayar.ir:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: [
          'turn:193.242.208.157:3478?transport=udp',
          'turn:193.242.208.157:3478?transport=tcp',
          'turn:turn.kitayar.ir:3478?transport=udp',
          'turn:turn.kitayar.ir:3478?transport=tcp',
          'turns:turn.kitayar.ir:5349?transport=tcp',
        ],
        username: 'kitayar',
        credential: 'KitayarTurnSecure2026!',
      },
    ]
  }
}