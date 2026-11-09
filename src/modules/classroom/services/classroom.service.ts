import { Types } from 'mongoose'
import { ClassroomSession, IClassroomSession, IClassroomTicket } from '../models/ClassroomSession.js'
import { SessionSourceAdapter, ISessionSource } from '../adapters/SessionSourceAdapter.js'
import { IRtcProvider, LiveKitRtcProvider } from '../adapters/RtcProvider.js'
import { ClassroomUserContext } from '../adapters/AuthAdapter.js'
import { logger } from '../../../core/utils/logger.js'

export interface IParticipantPermissions {
  canSpeak: boolean
  canVideo: boolean
  canDraw: boolean
}

export class ClassroomService {
  private rtcProvider: IRtcProvider

  constructor(rtcProvider?: IRtcProvider) {
    this.rtcProvider = rtcProvider || new LiveKitRtcProvider()
  }

  /**
   * Generates or fetches an active classroom session and issues a signed LiveKit JWT
   */
  async joinSession(
    sessionIdOrCode: string,
    user?: ClassroomUserContext | null,
    clientPlatform?: string,
    ticketCode?: string,
    guestName?: string
  ) {
    // 1. Resolve source (Booking or Question)
    const source: ISessionSource | null = await SessionSourceAdapter.resolveSource(sessionIdOrCode)

    // Fallback: If not found in booking or question, check if it's already an active ClassroomSession
    let session: IClassroomSession | null = null
    if (Types.ObjectId.isValid(sessionIdOrCode)) {
      session = await ClassroomSession.findById(sessionIdOrCode)
    }
    if (!session) {
      session = await ClassroomSession.findOne({
        $or: [
          { bookingCode: sessionIdOrCode },
          { roomName: sessionIdOrCode },
          { 'inviteTickets.ticketCode': ticketCode || sessionIdOrCode },
        ],
      })
    }

    if (!source && !session) {
      const error: any = new Error('جلسه یا کلاس مورد نظر یافت نشد')
      error.statusCode = 404
      throw error
    }

    // 2. Ticket-based Access (Join links)
    // IMPORTANT FIX: Always prioritize ticket identity (`ticket_${ticket.ticketCode}`) when ticketCode is provided
    // so testing Teacher & Student in two tabs of the same browser on localhost never collides on user.userId!
    if (ticketCode) {
      const ticket = (session?.inviteTickets || []).find((t) => t.ticketCode === ticketCode)
      if (!ticket) {
        const error: any = new Error('کد بلیت یا لینک عضویت نامعتبر است')
        error.statusCode = 400
        throw error
      }

      const isTeacher = ticket.role === 'teacher'
      const participantName = guestName?.trim() || ticket.name || (isTeacher ? 'استاد کلاس' : 'دانش‌آموز')
      const identity = `ticket_${ticket.ticketCode}`
      const role = ticket.role

      if (!ticket.isUsed) {
        ticket.isUsed = true
        ticket.usedAt = new Date()
        await session!.save()
      }

      const token = await this.rtcProvider.mintToken({
        identity,
        name: participantName,
        roomName: session!.roomName,
        isTeacher,
        ttlSeconds: 7200,
        metadata: {
          role,
          isTeacher,
          sessionId: session!._id.toString(),
          ticketCode: ticket.ticketCode,
        },
      })

      const serverUrl = this.rtcProvider.getServerUrl(clientPlatform)

      return {
        token,
        serverUrl,
        roomName: session!.roomName,
        sessionId: session!._id.toString(),
        status: session!.status,
        participant: {
          identity,
          name: participantName,
          role,
          isTeacher,
          permissions: {
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
            roomAdmin: isTeacher,
          },
        },
        title: session!.title,
        topic: session!.topic,
      }
    }

    // 3. User Context Validation (when not using ticket)
    if (!user) {
      const error: any = new Error('لطفاً وارد حساب کاربری خود شوید یا با لینک معتبر عضویت وارد شوید')
      error.statusCode = 401
      throw error
    }

    const teacherId = source ? source.teacherId : (session?.teacherId?.toString() || '')
    const studentId = source ? source.studentId : (session?.studentId?.toString() || '')
    const isTeacher = user.userId === teacherId || user.role === 'teacher'
    const isAdmin = user.role === 'admin'

    if (source && !source.canAccess(user.userId, user.role)) {
      const error: any = new Error('شما مجاز به ورود به این کلاس نیستید')
      error.statusCode = 403
      throw error
    }

    // 4. Ensure ClassroomSession entity exists in DB
    const cleanRoomCode = (source?.sourceId || session?.bookingCode || sessionIdOrCode)
      .toString()
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase()
    const roomName = session?.roomName || `kitayar-class-${cleanRoomCode}`

    if (!session) {
      session = await ClassroomSession.create({
        bookingId: source?.sourceType === 'online_class_booking' ? new Types.ObjectId(source.sourceId) : undefined,
        bookingCode: sessionIdOrCode,
        sourceType: source?.sourceType || 'online_class_booking',
        roomName,
        teacherId: Types.ObjectId.isValid(teacherId) ? new Types.ObjectId(teacherId) : undefined,
        studentId: Types.ObjectId.isValid(studentId) ? new Types.ObjectId(studentId) : undefined,
        invitedStudentIds: (source?.invitedStudentIds || []).map((id) => new Types.ObjectId(id)),
        title: source?.title || 'کلاس رفع اشکال آنلاین',
        topic: source?.topic,
        status: 'waiting',
        maxParticipants: 12,
      })
      logger.info(`[Classroom] Created new ClassroomSession: ${session._id} for room ${roomName}`)
    }

    // 5. Update source state if confirmed -> in_progress
    if (source) {
      await source.markInProgress()
    }

    const participantIdentity = `${user.role}_${user.userId}`

    // 6. Mint LiveKit Access Token
    const token = await this.rtcProvider.mintToken({
      identity: participantIdentity,
      name: user.name,
      roomName,
      isTeacher,
      ttlSeconds: 7200,
      metadata: {
        role: user.role,
        isTeacher,
        sessionId: session._id.toString(),
      },
    })

    const serverUrl = this.rtcProvider.getServerUrl(clientPlatform)

    return {
      token,
      serverUrl,
      roomName,
      sessionId: session._id.toString(),
      status: session.status,
      participant: {
        identity: participantIdentity,
        name: user.name,
        role: user.role,
        isTeacher,
        permissions: {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          roomAdmin: isTeacher || isAdmin,
        },
      },
      title: session.title,
      topic: session.topic,
    }
  }

  /**
   * Admin monitoring: Lists all active and recent classroom sessions
   */
  async listSessions(filter?: { status?: string }) {
    const query: any = {}
    if (filter?.status && filter.status !== 'all') {
      query.status = filter.status
    }
    const sessions = await ClassroomSession.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('teacherId', 'firstName lastName fullName phoneNumber')
      .populate('studentId', 'firstName lastName fullName phoneNumber')
      .lean()

    return sessions
  }

  /**
   * Admin: Creates an ad-hoc classroom session with a set of invite tickets
   */
  async createAdHocSession(params: {
    title: string
    topic?: string
    teacherName?: string
    studentCount?: number
    tickets?: Array<{ role: 'teacher' | 'student'; name: string }>
    adminUser?: ClassroomUserContext | null
  }) {
    const { title, topic, teacherName, studentCount = 2, tickets, adminUser } = params

    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const roomName = `kitayar-test-${Date.now().toString(36)}-${randomSuffix}`

    const generatedTickets: IClassroomTicket[] = []

    if (tickets && Array.isArray(tickets) && tickets.length > 0) {
      tickets.forEach((t, idx) => {
        const ticketCode = `t-${t.role === 'teacher' ? 'tch' : 'std'}-${Date.now().toString(36)}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`
        generatedTickets.push({
          ticketCode,
          role: t.role,
          name: t.name || (t.role === 'teacher' ? (teacherName || 'استاد کلاس') : `دانش‌آموز ${idx + 1}`),
          createdAt: new Date(),
          isUsed: false,
        })
      })
    } else {
      const teacherTicketCode = `t-tch-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`
      generatedTickets.push({
        ticketCode: teacherTicketCode,
        role: 'teacher',
        name: teacherName || 'استاد کلاس',
        createdAt: new Date(),
        isUsed: false,
      })

      const count = Math.max(1, Math.min(50, Number(studentCount) || 1))
      for (let i = 1; i <= count; i++) {
        const studentTicketCode = `t-std-${Date.now().toString(36)}-${i}-${Math.random().toString(36).substring(2, 6)}`
        generatedTickets.push({
          ticketCode: studentTicketCode,
          role: 'student',
          name: `دانش‌آموز ${i}`,
          createdAt: new Date(),
          isUsed: false,
        })
      }
    }

    const session = await ClassroomSession.create({
      sourceType: 'ad_hoc',
      roomName,
      title: title || 'کلاس تستی آنلاین',
      topic: topic || '',
      teacherName: teacherName || 'استاد کلاس',
      teacherId: adminUser?.userId && Types.ObjectId.isValid(adminUser.userId) ? new Types.ObjectId(adminUser.userId) : undefined,
      status: 'waiting',
      maxParticipants: Math.max(12, generatedTickets.length + 2),
      inviteTickets: generatedTickets,
    })

    logger.info(`[Classroom] Admin created ad-hoc session: ${session._id} with ${generatedTickets.length} tickets`)

    return session
  }

  /**
   * Adds more tickets/links to an existing classroom session
   */
  async addTicketsToSession(
    sessionId: string,
    params: {
      count?: number
      role?: 'teacher' | 'student'
      namePrefix?: string
      tickets?: Array<{ role: 'teacher' | 'student'; name: string }>
    }
  ) {
    const session = await this.findSession(sessionId)
    if (!session) {
      const error: any = new Error('جلسه یافت نشد')
      error.statusCode = 404
      throw error
    }

    const newTickets: IClassroomTicket[] = []

    if (params.tickets && Array.isArray(params.tickets) && params.tickets.length > 0) {
      params.tickets.forEach((t, idx) => {
        const ticketCode = `t-${t.role === 'teacher' ? 'tch' : 'std'}-${Date.now().toString(36)}-${session.inviteTickets.length + idx + 1}-${Math.random().toString(36).substring(2, 6)}`
        newTickets.push({
          ticketCode,
          role: t.role,
          name: t.name || (t.role === 'teacher' ? 'استاد' : `دانش‌آموز ${session.inviteTickets.length + idx + 1}`),
          createdAt: new Date(),
          isUsed: false,
        })
      })
    } else {
      const role = params.role || 'student'
      const count = Math.max(1, Math.min(50, Number(params.count) || 1))
      const prefix = params.namePrefix || (role === 'teacher' ? 'استاد' : 'دانش‌آموز')

      for (let i = 1; i <= count; i++) {
        const ticketNum = session.inviteTickets.length + i
        const ticketCode = `t-${role === 'teacher' ? 'tch' : 'std'}-${Date.now().toString(36)}-${ticketNum}-${Math.random().toString(36).substring(2, 6)}`
        newTickets.push({
          ticketCode,
          role,
          name: `${prefix} ${ticketNum}`,
          createdAt: new Date(),
          isUsed: false,
        })
      }
    }

    session.inviteTickets.push(...newTickets)
    await session.save()

    return {
      sessionId: session._id,
      roomName: session.roomName,
      newTickets,
      totalTickets: session.inviteTickets,
    }
  }

  /**
   * Retrieves all tickets for a classroom session
   */
  async listTickets(sessionId: string) {
    const session = await this.findSession(sessionId)
    if (!session) {
      const error: any = new Error('جلسه یافت نشد')
      error.statusCode = 404
      throw error
    }

    return {
      sessionId: session._id,
      roomName: session.roomName,
      title: session.title,
      tickets: session.inviteTickets || [],
    }
  }

  /**
   * Retrieves current status and metrics of a classroom
   */
  async getSessionStatus(sessionId: string, user: ClassroomUserContext) {
    const session = await this.findSession(sessionId)
    if (!session) {
      const error: any = new Error('جلسه یافت نشد')
      error.statusCode = 404
      throw error
    }

    return {
      sessionId: session._id,
      roomName: session.roomName,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSeconds: session.durationSeconds,
      participantsCount: (session.participantsLog || []).filter((p) => !p.leftAt).length,
      whiteboardElementsCount: session.whiteboardData?.elements?.length || 0,
      title: session.title,
      topic: session.topic,
    }
  }

  /**
   * Teacher ends the classroom session
   */
  async endSession(sessionId: string, user: ClassroomUserContext) {
    const session = await this.findSession(sessionId)
    if (!session) {
      const error: any = new Error('جلسه یافت نشد')
      error.statusCode = 404
      throw error
    }

    const isTeacher = session.teacherId ? session.teacherId.toString() === user.userId : (user.role === 'teacher')
    const isAdmin = user.role === 'admin'
    if (!isTeacher && !isAdmin) {
      const error: any = new Error('تنها معلم کلاس یا مدیر سامانه مجاز به بستن کلاس است')
      error.statusCode = 403
      throw error
    }

    await this.rtcProvider.closeRoom(session.roomName)

    session.status = 'completed'
    session.endedAt = new Date()
    if (session.startedAt) {
      session.durationSeconds = Math.round(
        (session.endedAt.getTime() - session.startedAt.getTime()) / 1000
      )
    }
    await session.save()

    if (session.bookingId) {
      const source = await SessionSourceAdapter.resolveSource(session.bookingId.toString())
      if (source) {
        await source.markCompleted()
      }
    }

    logger.info(`[Classroom] Session ${session._id} ended by ${user.userId}`)

    return {
      success: true,
      message: 'کلاس آنلاین با موفقیت خاتمه یافت',
      durationSeconds: session.durationSeconds,
    }
  }

  /**
   * Saves whiteboard snapshot
   */
  async saveWhiteboardSnapshot(
    sessionId: string,
    snapshot: { elements: any[]; viewport?: any },
    user: ClassroomUserContext
  ) {
    const session = await this.findSession(sessionId)
    if (!session) {
      const error: any = new Error('جلسه یافت نشد')
      error.statusCode = 404
      throw error
    }

    session.whiteboardData = {
      elements: snapshot.elements || [],
      viewport: snapshot.viewport,
      updatedAt: new Date(),
      updatedBy: new Types.ObjectId(user.userId),
    }

    await session.save()
    return { success: true, count: session.whiteboardData.elements.length }
  }

  /**
   * Retrieves latest whiteboard snapshot
   */
  async getWhiteboardSnapshot(sessionId: string, user: ClassroomUserContext) {
    const session = await this.findSession(sessionId)
    if (!session) {
      const error: any = new Error('جلسه یافت نشد')
      error.statusCode = 404
      throw error
    }

    return session.whiteboardData || { elements: [], viewport: { scale: 1, scrollX: 0, scrollY: 0 } }
  }

  /**
   * Process LiveKit Webhook events
   */
  async handleWebhookEvent(event: any) {
    const { event: eventName, room, participant } = event
    if (!room || !room.name) return

    logger.info(`[Classroom Webhook] Received: ${eventName} for room: ${room.name}`)

    const session = await ClassroomSession.findOne({ roomName: room.name })
    if (!session) {
      logger.warn(`[Classroom Webhook] No active session found for room ${room.name}`)
      return
    }

    switch (eventName) {
      case 'room_started':
        if (session.status !== 'active') {
          session.status = 'active'
          session.startedAt = session.startedAt || new Date()
          session.livekitRoomSid = room.sid
          await session.save()
        }
        break

      case 'participant_joined':
        if (participant) {
          const participantRole = participant.metadata
            ? JSON.parse(participant.metadata).role || 'student'
            : 'student'

          const userObjId = Types.ObjectId.isValid(participant.identity)
            ? new Types.ObjectId(participant.identity)
            : (session.studentId || new Types.ObjectId())

          session.participantsLog.push({
            userId: userObjId,
            identity: participant.identity,
            name: participant.name || 'شرکت‌کننده',
            role: participantRole,
            joinedAt: new Date(),
          })

          if (session.status === 'waiting' || session.status === 'scheduled') {
            session.status = 'active'
            session.startedAt = session.startedAt || new Date()
          }
          await session.save()
        }
        break

      case 'participant_left':
        if (participant) {
          const logEntry = session.participantsLog
            .slice()
            .reverse()
            .find((p) => p.identity === participant.identity && !p.leftAt)

          if (logEntry) {
            logEntry.leftAt = new Date()
            await session.save()
          }
        }
        break

      case 'room_finished':
        if (session.status !== 'completed') {
          session.status = 'completed'
          session.endedAt = new Date()
          if (session.startedAt) {
            session.durationSeconds = Math.round(
              (session.endedAt.getTime() - session.startedAt.getTime()) / 1000
            )
          }
          await session.save()

          if (session.bookingId) {
            const source = await SessionSourceAdapter.resolveSource(session.bookingId.toString())
            if (source) {
              await source.markCompleted()
            }
          }
        }
        break

      default:
        break
    }
  }

  // In-memory active presence, permissions, presentation state & direct participant mailboxes
  private static activeRoomsMap = new Map<string, Map<string, {
    identity: string
    name: string
    role: 'teacher' | 'student' | 'admin'
    isTeacher: boolean
    isMicOn: boolean
    isCamOn: boolean
    isScreenSharing: boolean
    handRaised: boolean
    permissions: IParticipantPermissions
    clientPlatform?: string
    lastSeen: number
  }>>()

  private static roomPresentationState = new Map<string, {
    activeUrl?: string
    pageNumber?: number
    totalPages?: number
    fileName?: string
  }>()

  private static roomMailboxes = new Map<string, Map<string, {
    signals: any[]
    whiteboardStrokes: any[]
    chatMessages: any[]
    controlActions: any[]
  }>>()

  private static getOrCreateMailbox(sId: string, identity: string) {
    if (!ClassroomService.roomMailboxes.has(sId)) {
      ClassroomService.roomMailboxes.set(sId, new Map())
    }
    const roomBox = ClassroomService.roomMailboxes.get(sId)!
    if (!roomBox.has(identity)) {
      roomBox.set(identity, { signals: [], whiteboardStrokes: [], chatMessages: [], controlActions: [] })
    }
    return roomBox.get(identity)!
  }

  /**
   * Real-time heartbeat, participant presence, permissions, and guaranteed FIFO mailbox delivery
   */
  async syncSession(
    sessionId: string,
    data: {
      identity: string
      name?: string
      role?: 'teacher' | 'student' | 'admin'
      isTeacher?: boolean
      isMicOn?: boolean
      isCamOn?: boolean
      isScreenSharing?: boolean
      handRaised?: boolean
      clientPlatform?: string
      whiteboardStroke?: any
      whiteboardStrokes?: any[]
      signal?: any
      signals?: any[]
      chatMessage?: any
      permissionUpdate?: {
        targetIdentity: string
        permissions: Partial<IParticipantPermissions>
        forceMuteMic?: boolean
        forceMuteCam?: boolean
        lowerHand?: boolean
      }
      presentationUpdate?: {
        activeUrl?: string
        pageNumber?: number
        totalPages?: number
        fileName?: string
      }
      lastSeenEventId?: number
    }
  ) {
    const session = await this.findSession(sessionId)
    if (!session) {
      const error: any = new Error('جلسه یافت نشد')
      error.statusCode = 404
      throw error
    }

    const sId = session._id.toString()
    if (!ClassroomService.activeRoomsMap.has(sId)) {
      ClassroomService.activeRoomsMap.set(sId, new Map())
    }

    const roomParticipants = ClassroomService.activeRoomsMap.get(sId)!
    const now = Date.now()

    // Register or update current participant
    if (data.identity) {
      const existing = roomParticipants.get(data.identity)
      const isTeacherRole = !!data.isTeacher || data.role === 'teacher'

      const defaultPermissions: IParticipantPermissions = isTeacherRole
        ? { canSpeak: true, canVideo: true, canDraw: true }
        : { canSpeak: true, canVideo: true, canDraw: false }

      roomParticipants.set(data.identity, {
        identity: data.identity,
        name: data.name || existing?.name || (isTeacherRole ? 'استاد کلاس' : 'دانش‌آموز'),
        role: data.role || existing?.role || (isTeacherRole ? 'teacher' : 'student'),
        isTeacher: isTeacherRole,
        isMicOn: !!data.isMicOn,
        isCamOn: !!data.isCamOn,
        isScreenSharing: !!data.isScreenSharing,
        handRaised: data.handRaised !== undefined ? !!data.handRaised : (existing?.handRaised || false),
        permissions: existing?.permissions || defaultPermissions,
        clientPlatform: data.clientPlatform || existing?.clientPlatform,
        lastSeen: now,
      })

      ClassroomService.getOrCreateMailbox(sId, data.identity)
    }

    // Handle teacher updating permissions or muting a participant
    if (data.permissionUpdate && data.isTeacher) {
      const { targetIdentity, permissions, forceMuteMic, forceMuteCam, lowerHand } = data.permissionUpdate
      const targetParticipant = roomParticipants.get(targetIdentity)
      if (targetParticipant) {
        targetParticipant.permissions = {
          ...targetParticipant.permissions,
          ...permissions,
        }
        if (forceMuteMic || permissions.canSpeak === false) {
          targetParticipant.isMicOn = false
        }
        if (forceMuteCam || permissions.canVideo === false) {
          targetParticipant.isCamOn = false
        }
        if (lowerHand) {
          targetParticipant.handRaised = false
        }
        roomParticipants.set(targetIdentity, targetParticipant)
      }

      const targetBox = ClassroomService.getOrCreateMailbox(sId, targetIdentity)
      targetBox.controlActions.push({
        type: 'permission_update',
        permissions: targetParticipant?.permissions || permissions,
        forceMuteMic,
        forceMuteCam,
        lowerHand,
      })
    }

    // Handle presentation / PDF state update
    if (data.presentationUpdate !== undefined) {
      ClassroomService.roomPresentationState.set(sId, data.presentationUpdate)
    }

    // Prune stale participants (inactive for > 25 seconds)
    for (const [id, p] of roomParticipants.entries()) {
      if (now - p.lastSeen > 25000) {
        roomParticipants.delete(id)
      }
    }

    // Deliver outgoing WebRTC signals (Direct targeted delivery or room broadcast)
    const incomingSignals: any[] = []
    if (data.signal) incomingSignals.push(data.signal)
    if (Array.isArray(data.signals)) incomingSignals.push(...data.signals)

    if (incomingSignals.length > 0) {
      const roomBox = ClassroomService.roomMailboxes.get(sId)
      if (roomBox) {
        for (const sig of incomingSignals) {
          const enrichedSig = { ...sig, senderIdentity: data.identity }
          if (sig.targetIdentity && roomBox.has(sig.targetIdentity)) {
            const targetBox = roomBox.get(sig.targetIdentity)!
            targetBox.signals.push(enrichedSig)
            if (targetBox.signals.length > 150) {
              targetBox.signals.splice(0, targetBox.signals.length - 150)
            }
          } else {
            for (const [pId, targetBox] of roomBox.entries()) {
              if (pId !== data.identity) {
                targetBox.signals.push(enrichedSig)
                if (targetBox.signals.length > 150) {
                  targetBox.signals.splice(0, targetBox.signals.length - 150)
                }
              }
            }
          }
        }
      }
    }

    // Deliver whiteboard strokes into other participants' mailboxes
    const incomingStrokes: any[] = []
    if (data.whiteboardStroke) incomingStrokes.push(data.whiteboardStroke)
    if (Array.isArray(data.whiteboardStrokes)) incomingStrokes.push(...data.whiteboardStrokes)

    if (incomingStrokes.length > 0) {
      const roomBox = ClassroomService.roomMailboxes.get(sId)
      if (roomBox) {
        for (const [pId, targetBox] of roomBox.entries()) {
          if (pId !== data.identity) {
            targetBox.whiteboardStrokes.push(...incomingStrokes)
            if (targetBox.whiteboardStrokes.length > 600) {
              targetBox.whiteboardStrokes.splice(0, targetBox.whiteboardStrokes.length - 600)
            }
          }
        }
      }
    }

    // Deliver chat message into other participants' mailboxes
    if (data.chatMessage) {
      const roomBox = ClassroomService.roomMailboxes.get(sId)
      if (roomBox) {
        for (const [pId, targetBox] of roomBox.entries()) {
          if (pId !== data.identity) {
            targetBox.chatMessages.push(data.chatMessage)
          }
        }
      }
    }

    const activeList = Array.from(roomParticipants.values())
    const teacherOnline = activeList.some((p) => p.isTeacher)
    const studentsOnlineCount = activeList.filter((p) => !p.isTeacher).length

    if (teacherOnline && studentsOnlineCount > 0 && session.status === 'waiting') {
      session.status = 'active'
      session.startedAt = session.startedAt || new Date()
      await session.save()
    }

    // Drain caller's mailbox
    const myBox = ClassroomService.getOrCreateMailbox(sId, data.identity)
    const mySignals = myBox.signals.splice(0, myBox.signals.length)
    const myStrokes = myBox.whiteboardStrokes.splice(0, myBox.whiteboardStrokes.length)
    const myChats = myBox.chatMessages.splice(0, myBox.chatMessages.length)
    const myControlActions = myBox.controlActions.splice(0, myBox.controlActions.length)

    return {
      roomStatus: session.status,
      participants: activeList,
      teacherOnline,
      studentsOnlineCount,
      signals: mySignals,
      strokes: myStrokes,
      chats: myChats,
      controlActions: myControlActions,
      presentation: ClassroomService.roomPresentationState.get(sId) || null,
      events: [],
      latestEventId: 0,
    }
  }

  private async findSession(idOrCode: string): Promise<IClassroomSession | null> {
    if (Types.ObjectId.isValid(idOrCode)) {
      const byId = await ClassroomSession.findById(idOrCode)
      if (byId) return byId
    }
    return await ClassroomSession.findOne({
      $or: [
        { roomName: idOrCode },
        { bookingCode: idOrCode },
        { 'inviteTickets.ticketCode': idOrCode },
      ],
    })
  }
}