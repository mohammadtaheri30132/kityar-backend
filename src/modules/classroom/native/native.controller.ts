import { Request, Response } from 'express'
import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'
import { ClassroomSession } from '../models/ClassroomSession.js'
import { RoomManager } from './services/RoomManager.js'
import { ServerTelemetrySampler } from './services/ServerTelemetrySampler.js'
import { NativeSignalingServer } from './ws/NativeSignalingServer.js'
import { AuthAdapter } from '../adapters/AuthAdapter.js'
import { OnlineClassBooking } from '../../../core/models/OnlineClassBooking.js'
import { OnlineClassService } from '../../../core/services/onlineClass.service.js'
import { logger } from '../../../core/utils/logger.js'

export class NativeClassroomController {
  /**
   * Create a new native classroom session (teacher/admin only)
   */
  static async createRoom(req: Request, res: Response) {
    try {
      const user = AuthAdapter.getUser(req)
      if (!user) {
        return res.status(401).json({ success: false, message: 'لطفاً وارد حساب کاربری خود شوید.' })
      }

      if (user.role !== 'teacher' && user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'فقط معلمان و مدیران مجاز به ساخت کلاس آنلاین هستند.' })
      }

      const { title, topic, maxParticipants = 8 } = req.body
      const roomName = `kitayar-native-${uuidv4().slice(0, 8)}`

      const session = await ClassroomSession.create({
        roomName,
        provider: 'internal',
        title: title || `کلاس آنلاین ${user.name}`,
        topic: topic || '',
        teacherId: user.userId,
        teacherName: user.name,
        status: 'scheduled',
        maxParticipants: Math.min(Math.max(Number(maxParticipants) || 8, 2), 12),
        sourceType: 'ad_hoc',
      })

      // Pre-initialize room in memory
      await RoomManager.getOrCreateRoom(roomName, session.title, user.userId, session.maxParticipants)

      return res.status(201).json({
        success: true,
        message: 'کلاس آنلاین بومی با موفقیت ایجاد شد',
        data: {
          roomId: session.roomName,
          title: session.title,
          maxParticipants: session.maxParticipants,
          status: session.status,
          teacherName: session.teacherName,
          joinPath: `/classroom/native/${session.roomName}`,
        },
      })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error creating room:', err)
      return res.status(500).json({ success: false, message: 'خطا در ایجاد کلاس آنلاین' })
    }
  }

  private static async findSessionByKey(roomId: string) {
    if (mongoose.connection.readyState !== 1) return null
    if (mongoose.isValidObjectId(roomId)) {
      const byId = await ClassroomSession.findOne({ $or: [{ _id: roomId }, { bookingId: roomId }] })
      if (byId) return byId
    }
    return ClassroomSession.findOne({
      $or: [
        { roomName: roomId },
        { plugNmeetRoomId: roomId },
        { bookingCode: roomId },
        { 'inviteTickets.ticketCode': roomId },
      ],
    })
  }

  /**
   * Get metadata and public info of a native room
   */
  static async getRoomInfo(req: Request, res: Response) {
    try {
      const roomId = req.params.roomId as string
      const queryTicket = typeof req.query.ticket === 'string' ? req.query.ticket.trim() : ''
      const session = await NativeClassroomController.findSessionByKey(roomId)

      const canonicalRoomId = session?.roomName || roomId
      const activeList = RoomManager.getActiveParticipantsList(canonicalRoomId)
      const hasActiveTeacher = activeList.some(p => p.role === 'teacher' || p.isTeacher)

      if (!session) {
        return res.json({
          success: true,
          data: {
            roomId: canonicalRoomId,
            title:
              roomId.toLowerCase().includes('test') || roomId.startsWith('test')
                ? 'اتاق تست صوتی و تصویری کیتایار (بدون نیاز به لاگین)'
                : 'کلاس آنلاین هوشمند کیتایار',
            topic: 'کلاس آنلاین صوتی، تصویری و تخته هوشمند',
            teacherName: 'مدرس کیتایار',
            status: 'active',
            maxParticipants: 20,
            activeCount: activeList.length,
            hasActiveTeacher,
            uiMode: 'online_class',
            registrationForm: { enabled: false, fields: [] },
            ticketValid: false,
            ticketInvalid: false,
            requiresAuthOrTicket: false,
            provider: 'internal',
          },
        })
      }

      const matchedTicket = session?.inviteTickets?.find(
        (t: any) => (queryTicket && t.ticketCode === queryTicket) || t.ticketCode === roomId
      )

      let isLocked = false
      let unlocksAt: Date | undefined
      let remainingSeconds = 0
      let bookingData: any = null
      const policy = await OnlineClassService.getSessionPolicy()

      if (session?.bookingId) {
        try {
          const booking = await OnlineClassBooking.findById(session.bookingId)
          if (booking) {
            bookingData = {
              scheduledAt: booking.scheduledAt,
              durationMinutes: booking.durationMinutes,
              teacherJoinedAt: booking.teacherJoinedAt,
              effectiveStartAt: booking.effectiveStartAt,
              endsAt: booking.endsAt,
              status: booking.status,
              teacherNoShow: booking.teacherNoShow,
            }

            const scheduledMs = new Date(booking.scheduledAt).getTime()
            const now = Date.now()
            const unlockBeforeMs = (policy.unlockBeforeMinutes ?? 5) * 60 * 1000
            const unlockTime = scheduledMs - unlockBeforeMs

            if (now < unlockTime) {
              isLocked = true
              unlocksAt = new Date(unlockTime)
              remainingSeconds = Math.ceil((unlockTime - now) / 1000)
            }

            // Check if teacher exceeded grace period
            const graceMs = (policy.teacherGraceMinutes ?? 30) * 60 * 1000
            if (!booking.teacherJoinedAt && now > scheduledMs + graceMs) {
              await OnlineClassService.handleTeacherNoShow(booking)
              bookingData.status = 'cancelled'
              bookingData.teacherNoShow = true
            }
          }
        } catch (bErr) {
          logger.warn('[NativeClassroom] Error fetching booking for room info:', bErr)
        }
      }

      return res.json({
        success: true,
        data: {
          roomId: session.roomName,
          title: session.title,
          topic: session.topic,
          teacherName: session.teacherName,
          status: session.status,
          maxParticipants: session.maxParticipants || 20,
          activeCount: activeList.length,
          hasActiveTeacher,
          uiMode: session.uiMode || 'online_class',
          registrationForm: session.registrationForm || { enabled: false, fields: [] },
          ticketRole: matchedTicket?.role,
          ticketName: matchedTicket?.name,
          ticketValid: Boolean(matchedTicket),
          ticketInvalid: Boolean(queryTicket && !matchedTicket),
          requiresAuthOrTicket: session.sourceType === 'online_class_booking',
          provider: 'internal',
          isLocked,
          unlocksAt,
          remainingSeconds,
          policy: {
            unlockBeforeMinutes: policy.unlockBeforeMinutes,
            teacherGraceMinutes: policy.teacherGraceMinutes,
            extraMinutes: policy.extraMinutes,
            endWarningMinutes: policy.endWarningMinutes,
            studentRules: policy.studentRules,
            teacherRules: policy.teacherRules,
          },
          booking: bookingData,
        },
      })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error fetching room info:', err)
      return res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات کلاس' })
    }
  }

  /**
   * Return ICE Servers list (STUN & TURN)
   */
  static async getIceServers(req: Request, res: Response) {
    try {
      const signalingServer = NativeSignalingServer.getInstance()
      const iceServers = signalingServer
        ? signalingServer.getIceServers()
        : [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:turn.kitayar.ir:3478' },
            {
              urls: [
                'turn:turn.kitayar.ir:3478?transport=udp',
                'turn:turn.kitayar.ir:3478?transport=tcp',
              ],
              username: 'kitayar',
              credential: 'KitayarTurnSecure2026!',
            },
          ]

      return res.json({
        success: true,
        data: { iceServers },
      })
    } catch (err: any) {
      return res.status(500).json({ success: false, message: 'خطا در دریافت سرورهای ICE' })
    }
  }

  /**
   * Create invitation ticket for a student
   */
  static async createTicket(req: Request, res: Response) {
    try {
      const user = AuthAdapter.getUser(req)
      const roomId = req.params.roomId as string
      const { name, role = 'student' } = req.body

      const session = await ClassroomSession.findOne({ roomName: roomId })
      if (!session) {
        return res.status(404).json({ success: false, message: 'کلاس یافت نشد' })
      }

      if (user && session.teacherId && user.userId !== session.teacherId.toString() && user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'شما مجاز به صدور بلیت برای این کلاس نیستید' })
      }

      const ticketCode = `tkt_${uuidv4().slice(0, 10)}`
      const newTicket = {
        ticketCode,
        role: role as 'teacher' | 'student',
        name: name || 'دانش‌آموز مهمان',
        createdAt: new Date(),
        isUsed: false,
      }

      session.inviteTickets.push(newTicket)
      await session.save()

      return res.status(201).json({
        success: true,
        message: 'بلیت ورود به کلاس با موفقیت صادر شد',
        data: {
          ticketCode,
          name: newTicket.name,
          role: newTicket.role,
          joinPath: `/classroom/native/${roomId}?ticket=${ticketCode}`,
        },
      })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error issuing ticket:', err)
      return res.status(500).json({ success: false, message: 'خطا در صدور بلیت' })
    }
  }

  /**
   * Get active state (participants and mic states) in real-time
   */
  static async getActiveState(req: Request, res: Response) {
    try {
      const roomId = req.params.roomId as string
      const room = RoomManager.getRoom(roomId)
      const participants = RoomManager.getActiveParticipantsList(roomId)

      return res.json({
        success: true,
        data: {
          roomId,
          status: room ? room.status : 'scheduled',
          participants,
          isTestRoom: room ? room.isTestRoom : RoomManager.isTestRoomId(roomId),
          recording: room ? room.recording : null,
        },
      })
    } catch (err: any) {
      return res.status(500).json({ success: false, message: 'خطا در دریافت وضعیت زنده کلاس' })
    }
  }

  /**
   * POST /api/classroom/native/rooms/:roomId/recording/start
   */
  static async startRecording(req: Request, res: Response) {
    try {
      const roomId = req.params.roomId as string
      const { actorName, actorRole, peerId, mode } = req.body || {}
      await RoomManager.getOrCreateRoom(roomId)
      const rec = RoomManager.startRecording(roomId, mode, {
        peerId,
        name: actorName || 'کاربر',
        role: actorRole || 'teacher',
      })
      const sig = NativeSignalingServer.getInstance()
      if (sig) {
        sig.broadcastRecordingState(roomId)
      }
      return res.json({
        success: true,
        message: 'ضبط کلاس آغاز شد',
        data: rec,
      })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error starting recording:', err)
      return res.status(500).json({ success: false, message: 'خطا در شروع ضبط کلاس' })
    }
  }

  /**
   * POST /api/classroom/native/rooms/:roomId/recording/stop
   */
  static async stopRecording(req: Request, res: Response) {
    try {
      const roomId = req.params.roomId as string
      const { actorName, actorRole, peerId, reason } = req.body || {}
      const rec = RoomManager.stopRecording(
        roomId,
        {
          peerId,
          name: actorName || 'کاربر',
          role: actorRole || 'teacher',
        },
        reason
      )
      const sig = NativeSignalingServer.getInstance()
      if (sig) {
        sig.broadcastRecordingState(roomId)
      }
      return res.json({
        success: true,
        message: 'ضبط کلاس متوقف و ذخیره شد',
        data: rec,
      })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error stopping recording:', err)
      return res.status(500).json({ success: false, message: 'خطا در توقف ضبط کلاس' })
    }
  }

  /**
   * POST /api/classroom/native/rooms/:roomId/recording/chunk
   */
  static async uploadRecordingChunk(req: Request, res: Response) {
    try {
      const roomId = req.params.roomId as string
      let buffer: Buffer | null = null

      if (Buffer.isBuffer(req.body)) {
        buffer = req.body
      } else if (req.body && typeof req.body.chunkBase64 === 'string') {
        buffer = Buffer.from(req.body.chunkBase64, 'base64')
      }

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ success: false, message: 'قطعه ویدیویی ارسال نشده است' })
      }

      await RoomManager.getOrCreateRoom(roomId)
      const stats = RoomManager.appendRecordingChunk(roomId, buffer)

      return res.json({
        success: true,
        data: stats,
      })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error uploading recording chunk:', err)
      return res.status(500).json({ success: false, message: 'خطا در ذخیره قطعه ضبط کلاس' })
    }
  }

  /**
   * GET /api/classroom/native/rooms/:roomId/recording
   * Returns synchronized recording data (videoUrl, serverLogs, chatLog, whiteboardTimeline, participantsLog)
   */
  static async getRecording(req: Request, res: Response) {
    try {
      await RoomManager.cleanupExpiredRecordings()
      const roomId = req.params.roomId as string

      const liveRoom = RoomManager.getRoom(roomId)
      const completedRoom = RoomManager.getCompletedRoom(roomId)

      let sessionDoc: any = null
      if (mongoose.connection.readyState === 1) {
        if (mongoose.isValidObjectId(roomId)) {
          sessionDoc = await ClassroomSession.findById(roomId).lean()
        }
        if (!sessionDoc) {
          sessionDoc = await ClassroomSession.findOne({
            $or: [{ roomName: roomId }, { bookingCode: roomId }, { plugNmeetRoomId: roomId }],
          }).lean()
        }
      }

      const memRoom = liveRoom || completedRoom
      if (!memRoom && !sessionDoc) {
        return res.status(404).json({ success: false, message: 'اطلاعات ضبط این کلاس یافت نشد' })
      }

      const baseStart =
        memRoom?.recording?.startedAt ||
        (sessionDoc?.recording?.startedAt ? new Date(sessionDoc.recording.startedAt).getTime() : 0) ||
        memRoom?.startedAt ||
        (sessionDoc?.startedAt ? new Date(sessionDoc.startedAt).getTime() : Date.now())

      const serverLogs =
        memRoom?.recording?.serverLogs?.length
          ? memRoom.recording.serverLogs
          : (sessionDoc?.recording?.serverLogs || []).map((l: any) => ({
              ...l,
              timestamp: l.timestamp ? new Date(l.timestamp).getTime() : baseStart + (l.offsetMs || 0),
            }))

      const chatLog =
        memRoom?.chatMessages?.length
          ? memRoom.chatMessages.map(c => ({
              id: c.id,
              senderId: c.senderId || (c as any).senderPeerId,
              senderName: c.senderName,
              senderRole: c.senderRole,
              message: c.message || (c as any).text || '',
              timestamp: c.timestamp,
              offsetMs: typeof c.offsetMs === 'number' ? c.offsetMs : Math.max(0, c.timestamp - baseStart),
            }))
          : (sessionDoc?.recording?.chatLog || []).map((c: any) => ({
              ...c,
              timestamp: c.timestamp ? new Date(c.timestamp).getTime() : baseStart + (c.offsetMs || 0),
            }))

      const whiteboardTimeline =
        memRoom?.recording?.whiteboardTimeline?.length
          ? memRoom.recording.whiteboardTimeline
          : (sessionDoc?.recording?.whiteboardTimeline || []).map((w: any) => ({
              ...w,
              timestamp: w.timestamp ? new Date(w.timestamp).getTime() : baseStart + (w.offsetMs || 0),
            }))

      const participantsLog =
        sessionDoc?.participantsLog?.length
          ? sessionDoc.participantsLog
          : memRoom
            ? Array.from(memRoom.participants.values()).map(p => ({
                identity: p.peerId,
                name: p.name,
                role: p.role,
                joinedAt: new Date(p.joinedAt),
              }))
            : []

      const videoUrl = memRoom?.recording?.videoUrl || sessionDoc?.recording?.videoUrl
      const status =
        memRoom?.recording?.status && memRoom.recording.status !== 'idle'
          ? memRoom.recording.status
          : sessionDoc?.recording?.status || 'idle'
      const durationSeconds =
        sessionDoc?.recording?.durationSeconds ||
        sessionDoc?.durationSeconds ||
        (memRoom?.recording?.startedAt
          ? Math.max(1, Math.round(((memRoom.recording.endedAt || Date.now()) - memRoom.recording.startedAt) / 1000))
          : 0)

      const retentionHours = await RoomManager.getRetentionHours()

      return res.json({
        success: true,
        data: {
          roomId: sessionDoc?.roomName || roomId,
          sessionId: sessionDoc?._id,
          title: sessionDoc?.title || memRoom?.title || 'کلاس آنلاین',
          teacherName: sessionDoc?.teacherName || 'استاد کلاس',
          studentName: sessionDoc?.studentName || 'دانش‌آموز',
          isTestRoom: memRoom ? memRoom.isTestRoom : RoomManager.isTestRoomId(roomId),
          status,
          isRecording: !!memRoom?.recording?.isRecording,
          mode: memRoom?.recording?.mode || sessionDoc?.recording?.mode || 'auto',
          startedAt: memRoom?.recording?.startedAt || sessionDoc?.recording?.startedAt || sessionDoc?.startedAt,
          endedAt: memRoom?.recording?.endedAt || sessionDoc?.recording?.endedAt || sessionDoc?.endedAt,
          durationSeconds,
          videoUrl,
          fileSize: memRoom?.recording?.fileSize || sessionDoc?.recording?.fileSize || 0,
          chunksCount: memRoom?.recording?.chunksCount || sessionDoc?.recording?.chunksCount || 0,
          expiresAt:
            memRoom?.recording?.expiresAt
              ? new Date(memRoom.recording.expiresAt)
              : sessionDoc?.recording?.expiresAt,
          deletedAt: sessionDoc?.recording?.deletedAt,
          retentionHours,
          serverLogs,
          chatLog,
          whiteboardTimeline,
          participantsLog,
          whiteboardSnapshot: memRoom?.whiteboard || sessionDoc?.whiteboardData,
        },
      })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error getting recording:', err)
      return res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات ضبط کلاس' })
    }
  }

  /**
   * DELETE /api/classroom/native/rooms/:roomId/recording
   */
  static async deleteRecording(req: Request, res: Response) {
    try {
      const roomId = req.params.roomId as string
      const fs = await import('fs')
      const path = await import('path')
      const recordingsDir = path.join(process.cwd(), 'uploads', 'class-recordings')

      const memRoom = RoomManager.getRoom(roomId) || RoomManager.getCompletedRoom(roomId)
      if (memRoom?.recording?.filePath && fs.existsSync(memRoom.recording.filePath)) {
        fs.unlinkSync(memRoom.recording.filePath)
      }
      if (memRoom?.recording) {
        memRoom.recording.status = 'deleted'
        memRoom.recording.videoUrl = undefined
      }

      if (mongoose.connection.readyState === 1) {
        const session = await ClassroomSession.findOne({
          $or: [{ roomName: roomId }, ...(mongoose.isValidObjectId(roomId) ? [{ _id: roomId }] : [])],
        })
        if (session?.recording) {
          if (session.recording.videoUrl) {
            const fullPath = path.join(recordingsDir, path.basename(session.recording.videoUrl))
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath)
            }
          }
          session.recording.status = 'deleted'
          session.recording.deletedAt = new Date()
          session.recording.videoUrl = undefined
          session.recording.serverLogs.push({
            timestamp: new Date(),
            offsetMs: 0,
            type: 'system',
            actorName: 'ادمین',
            actorRole: 'admin',
            message: 'فایل ویدیوی ضبط‌شده توسط مدیر سیستم حذف شد',
          })
          await session.save()
        }
      }

      return res.json({
        success: true,
        message: 'فایل ویدیوی ضبط‌شده کلاس با موفقیت از سرور حذف شد',
      })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error deleting recording:', err)
      return res.status(500).json({ success: false, message: 'خطا در حذف فایل ضبط‌شده' })
    }
  }

  /**
   * POST /api/classroom/native/rooms/:roomId/register
   * Submit pre-entry registration form answers and return stable attendeeKey (prevents duplicate attendance rows).
   */
  static async registerAttendee(req: Request, res: Response) {
    try {
      const roomId = req.params.roomId as string
      const { displayName, formAnswers = {}, attendeeKey: clientAttendeeKey } = req.body || {}
      const session = await NativeClassroomController.findSessionByKey(roomId)

      const canonicalRoomId = session?.roomName || roomId
      const formConfig = session?.registrationForm

      // Validate required custom fields
      if (formConfig?.enabled && Array.isArray(formConfig.fields)) {
        for (const field of formConfig.fields) {
          if (!field.required) continue
          const val = formAnswers?.[field.id]
          const isEmpty =
            field.type === 'checkbox'
              ? val !== true
              : val === undefined || val === null || String(val).trim() === ''
          if (isEmpty) {
            return res.status(400).json({
              success: false,
              message: `لطفاً فیلد اجباری «${field.label}» را تکمیل کنید`,
              fieldId: field.id,
            })
          }
        }
      }

      const cleanName =
        String(displayName || '').trim() ||
        String(
          Object.entries(formAnswers || {}).find(([k]) => /name|fullname|نام/i.test(k))?.[1] || ''
        ).trim() ||
        'شرکت‌کننده'

      // Deterministic key: client token > phone/email answer > new UUID
      let attendeeKey = String(clientAttendeeKey || '').trim()
      if (!attendeeKey && formConfig?.fields?.length) {
        const phoneField = formConfig.fields.find(f => f.type === 'phone')
        const emailField = formConfig.fields.find(f => f.type === 'email')
        const phoneVal = phoneField ? String(formAnswers?.[phoneField.id] || '').replace(/\s+/g, '') : ''
        const emailVal = emailField ? String(formAnswers?.[emailField.id] || '').trim().toLowerCase() : ''
        if (phoneVal) attendeeKey = `phone:${phoneVal}`
        else if (emailVal) attendeeKey = `email:${emailVal}`
      }
      if (!attendeeKey) {
        attendeeKey = `att_${uuidv4().replace(/-/g, '').slice(0, 12)}`
      }

      RoomManager.trackAttendeeRegistration(canonicalRoomId, attendeeKey, cleanName, formAnswers)

      if (session) {
        const existingIdx = (session.attendees || []).findIndex(a => a.attendeeKey === attendeeKey)
        if (existingIdx >= 0) {
          session.attendees[existingIdx].displayName = cleanName
          session.attendees[existingIdx].formAnswers = {
            ...(session.attendees[existingIdx].formAnswers || {}),
            ...(formAnswers || {}),
          }
        } else {
          session.attendees.push({
            attendeeKey,
            displayName: cleanName,
            role: 'student',
            formAnswers: formAnswers || {},
            registeredAt: new Date(),
            joinCount: 0,
            totalDurationSeconds: 0,
            isOnline: false,
            activePeerIds: [],
            sessions: [],
          })
        }
        session.markModified('attendees')
        await session.save()
      }

      return res.json({
        success: true,
        message: 'ثبت‌نام ورود با موفقیت انجام شد',
        data: {
          roomId: canonicalRoomId,
          attendeeKey,
          displayName: cleanName,
          formAnswers,
        },
      })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error registering attendee:', err)
      return res.status(500).json({ success: false, message: 'خطا در ثبت اطلاعات فرم ورود' })
    }
  }

  /**
   * GET /api/classroom/native/rooms/:roomId/attendance-report
   * Efficient cumulative attendance & dynamic form report for Admin Panel
   */
  static async getAttendanceReport(req: Request, res: Response) {
    try {
      const roomId = req.params.roomId as string
      const session = await NativeClassroomController.findSessionByKey(roomId)
      const canonicalRoomId = session?.roomName || roomId
      const attendees = RoomManager.getAttendanceSnapshot(canonicalRoomId, session?.attendees || [])
      const liveRoom = RoomManager.getRoom(canonicalRoomId) || RoomManager.getCompletedRoom(canonicalRoomId)
      const polls = RoomManager.serializePolls(liveRoom?.polls || (session as any)?.polls || [])

      const joinedAttendees = attendees.filter(a => (a.joinCount || 0) > 0)
      const totalDurationAll = joinedAttendees.reduce((acc, a) => acc + (a.effectiveDurationSeconds || 0), 0)

      return res.json({
        success: true,
        data: {
          roomId: canonicalRoomId,
          title: session?.title || canonicalRoomId,
          uiMode: session?.uiMode || 'online_class',
          status: session?.status || 'active',
          registrationForm: session?.registrationForm || { enabled: false, fields: [] },
          summary: {
            totalRegistered: attendees.length,
            totalAttended: joinedAttendees.length,
            currentlyOnline: attendees.filter(a => a.isOnline).length,
            totalJoinEvents: attendees.reduce((acc, a) => acc + (a.joinCount || 0), 0),
            averageDurationSeconds: joinedAttendees.length
              ? Math.round(totalDurationAll / joinedAttendees.length)
              : 0,
          },
          attendees: attendees.sort((a, b) => (b.effectiveDurationSeconds || 0) - (a.effectiveDurationSeconds || 0)),
          polls,
        },
      })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error building attendance report:', err)
      return res.status(500).json({ success: false, message: 'خطا در دریافت گزارش حضور و غیاب' })
    }
  }

  /**
   * GET /api/classroom/native/rooms/:roomId/telemetry-report
   * Technical server resource & capacity report for a specific room
   */
  static async getRoomTelemetryReport(req: Request, res: Response) {
    try {
      const roomId = req.params.roomId as string
      const session = await NativeClassroomController.findSessionByKey(roomId)
      const canonicalRoomId = session?.roomName || roomId
      const liveRoom = RoomManager.getRoom(canonicalRoomId) || RoomManager.getCompletedRoom(canonicalRoomId)

      const report = ServerTelemetrySampler.buildDeveloperReport({
        roomId: canonicalRoomId,
        sessionDoc: session?.toObject(),
        liveRoom,
      })

      return res.json({ success: true, data: report })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error building room telemetry report:', err)
      return res.status(500).json({ success: false, message: 'خطا در دریافت گزارش فنی سرور' })
    }
  }

  /**
   * GET /api/classroom/native/telemetry/server
   * Global server resource & load-testing capacity report
   */
  static async getServerTelemetryReport(_req: Request, res: Response) {
    try {
      const report = ServerTelemetrySampler.buildDeveloperReport()
      return res.json({ success: true, data: report })
    } catch (err: any) {
      logger.error('[NativeClassroom] Error building server telemetry report:', err)
      return res.status(500).json({ success: false, message: 'خطا در دریافت گزارش سلامت سرور' })
    }
  }
}
