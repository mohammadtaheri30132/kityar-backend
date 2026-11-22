import crypto from 'crypto'
import { Request, Response } from 'express'
import { Types } from 'mongoose'
import {
  ClassroomSession,
  ClassroomUiMode,
  IClassroomTicket,
  IRegistrationFormConfig,
  IRegistrationFormField,
  RegistrationFieldType,
} from '../models/ClassroomSession.js'
import { RoomManager } from '../native/services/RoomManager.js'
import { AuthAdapter } from '../adapters/AuthAdapter.js'
import { SessionSourceAdapter } from '../adapters/SessionSourceAdapter.js'
import { OnlineClassBooking } from '../../../core/models/OnlineClassBooking.js'
import { OnlineClassService } from '../../../core/services/onlineClass.service.js'
import { logger } from '../../../core/utils/logger.js'

/**
 * Unified Classroom Controller (Native WebRTC Engine)
 * Replaces legacy plugNmeet / LiveKit calls with Kitayar Native WebRTC Engine
 * while maintaining 100% API compatibility for existing web & mobile endpoints.
 */
export class PlugNmeetController {
  static async createSession(req: Request, res: Response): Promise<void> {
    try {
      const user = AuthAdapter.getUser(req)
      if (!user) {
        res.status(401).json({ success: false, message: 'دسترسی غیرمجاز. لطفاً وارد حساب کاربری خود شوید' })
        return
      }

      const {
        title,
        topic,
        teacherName,
        studentCount = 2,
        tickets,
        maxParticipants,
        uiMode = 'online_class',
        registrationForm,
      } = req.body

      if (!title || !title.trim()) {
        res.status(400).json({ success: false, message: 'عنوان کلاس یا سمینار الزامی است' })
        return
      }

      const normalizedUiMode: ClassroomUiMode = uiMode === 'seminar' ? 'seminar' : 'online_class'
      const validFieldTypes: RegistrationFieldType[] = ['text', 'phone', 'email', 'number', 'select', 'checkbox']
      const normalizedForm: IRegistrationFormConfig = {
        enabled: !!registrationForm?.enabled && Array.isArray(registrationForm?.fields) && registrationForm.fields.length > 0,
        title: registrationForm?.title?.trim() || '',
        description: registrationForm?.description?.trim() || '',
        fields: Array.isArray(registrationForm?.fields)
          ? registrationForm.fields
              .filter((f: any) => f && String(f.label || '').trim())
              .map((f: any, idx: number): IRegistrationFormField => ({
                id: String(f.id || `field_${idx + 1}`).trim(),
                label: String(f.label).trim(),
                type: validFieldTypes.includes(f.type) ? f.type : 'text',
                required: !!f.required,
                placeholder: f.placeholder ? String(f.placeholder).trim() : '',
                options: Array.isArray(f.options)
                  ? f.options.map((o: any) => String(o).trim()).filter(Boolean)
                  : [],
              }))
          : [],
      }

      const randomSuffix = Math.random().toString(36).substring(2, 7)
      const roomId = `${normalizedUiMode === 'seminar' ? 'seminar' : 'kitayar'}-${Date.now().toString(36)}-${randomSuffix}`
      const cleanTitle = title.trim()

      // Generate Invite Tickets for Teacher/Host (and Students for regular interactive classes)
      const generatedTickets: IClassroomTicket[] = []

      if (tickets && Array.isArray(tickets) && tickets.length > 0) {
        tickets.forEach((t: any, idx: number) => {
          const ticketCode = `inv-${t.role === 'teacher' ? 'tch' : 'std'}-${Date.now().toString(36)}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`
          generatedTickets.push({
            ticketCode,
            role: t.role,
            name: t.name || (t.role === 'teacher' ? (teacherName || 'استاد کلاس') : `دانش‌آموز ${idx + 1}`),
            createdAt: new Date(),
            isUsed: false,
          })
        })
      } else {
        const teacherTicketCode = `inv-tch-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`
        generatedTickets.push({
          ticketCode: teacherTicketCode,
          role: 'teacher',
          name: teacherName || (normalizedUiMode === 'seminar' ? 'مجری / سخنران سمینار' : 'استاد کلاس'),
          createdAt: new Date(),
          isUsed: false,
        })

        const defaultStudentTickets = normalizedUiMode === 'seminar' ? 1 : 2
        const count = Math.max(1, Math.min(100, Number(studentCount ?? defaultStudentTickets) || 1))
        for (let i = 1; i <= count; i++) {
          const studentTicketCode = `inv-std-${Date.now().toString(36)}-${i}-${Math.random().toString(36).substring(2, 6)}`
          generatedTickets.push({
            ticketCode: studentTicketCode,
            role: 'student',
            name: normalizedUiMode === 'seminar' ? `مهمان ${i}` : `دانش‌آموز ${i}`,
            createdAt: new Date(),
            isUsed: false,
          })
        }
      }

      const defaultCap = normalizedUiMode === 'seminar' ? 100 : 20
      const requestedCap = Number(maxParticipants) || defaultCap
      const maxCap = Math.min(1000, Math.max(requestedCap, generatedTickets.length + 5))

      const session = await ClassroomSession.create({
        sourceType: 'ad_hoc',
        provider: 'internal',
        roomName: roomId,
        plugNmeetRoomId: roomId,
        title: cleanTitle,
        topic: topic?.trim() || '',
        teacherName: teacherName?.trim() || (normalizedUiMode === 'seminar' ? 'مجری سمینار' : 'استاد کلاس'),
        teacherId: user.userId && Types.ObjectId.isValid(user.userId) ? new Types.ObjectId(user.userId) : undefined,
        status: 'waiting',
        maxParticipants: maxCap,
        uiMode: normalizedUiMode,
        registrationForm: normalizedForm,
        inviteTickets: generatedTickets,
      })

      const room = await RoomManager.getOrCreateRoom(roomId, cleanTitle, user.userId, maxCap)
      room.uiMode = normalizedUiMode

      logger.info(`[NativeClassroom] Created ClassroomSession ${session._id} (room: ${roomId}, uiMode: ${normalizedUiMode})`)

      const teacherTicket = generatedTickets.find(t => t.role === 'teacher')
      res.status(201).json({
        success: true,
        message: normalizedUiMode === 'seminar' ? 'لینک سمینار اختصاصی با موفقیت ایجاد شد' : 'کلاس آنلاین اختصاصی کیتایار با موفقیت ایجاد شد',
        data: session,
        links: {
          publicJoinPath: `/classroom/native/${roomId}`,
          hostJoinPath: teacherTicket ? `/classroom/native/${roomId}?ticket=${teacherTicket.ticketCode}` : `/classroom/native/${roomId}`,
        },
      })
    } catch (error: any) {
      logger.error('[Classroom] createSession error:', error)
      res.status(500).json({
        success: false,
        message: error.message || 'خطا در ایجاد کلاس آنلاین',
      })
    }
  }

  static async getJoinToken(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId
      const ticketCode = (req.query.ticket || req.query.token || req.body?.ticket || req.body?.token || '') as string
      const guestName = (req.query.name || req.body?.name || '') as string
      const linkOnly = Boolean(req.body?.linkOnly || req.query?.linkOnly === 'true')
      const user = AuthAdapter.getUser(req)

      let resolvedTicket = ticketCode
      if (!resolvedTicket && sessionId.startsWith('inv-')) {
        resolvedTicket = sessionId
      }

      let session = null
      if (Types.ObjectId.isValid(sessionId)) {
        session = await ClassroomSession.findOne({ $or: [{ _id: sessionId }, { bookingId: sessionId }] })
      }
      if (!session) {
        const orClauses: any[] = [
          { roomName: sessionId },
          { plugNmeetRoomId: sessionId },
          { bookingCode: sessionId },
          { 'inviteTickets.ticketCode': sessionId },
        ]
        if (resolvedTicket) orClauses.push({ 'inviteTickets.ticketCode': resolvedTicket })
        session = await ClassroomSession.findOne({ $or: orClauses })
      }

      const source =
        !session || (!resolvedTicket && session.sourceType === 'online_class_booking')
          ? await SessionSourceAdapter.resolveSource(session?.bookingId?.toString() || sessionId)
          : null

      if (!session && source) {
        if (!user) {
          res.status(401).json({ success: false, message: 'لطفاً وارد حساب کاربری خود شوید یا با لینک معتبر عضویت وارد شوید' })
          return
        }
        if (!source.isJoinableStatus()) {
          res.status(403).json({
            success: false,
            message: ['completed', 'cancelled', 'rejected', 'refunded'].includes(source.status)
              ? 'این کلاس به پایان رسیده یا لغو شده است و امکان ورود مجدد وجود ندارد.'
              : 'این کلاس هنوز توسط معلم تایید نهایی نشده است.',
          })
          return
        }
        if (!(await source.canAccess(user.userId, user.role))) {
          res.status(403).json({ success: false, message: 'شما عضو تاییدشده این کلاس نیستید و مجاز به ورود به کلاس نیستید.' })
          return
        }

        const bookingMeta =
          source.sourceType === 'online_class_booking'
            ? await OnlineClassBooking.findById(source.sourceId)
            : null

        // Enforce session policy (Locking & Teacher Grace Period)
        if (!linkOnly && bookingMeta && bookingMeta.scheduledAt) {
          const policy = await OnlineClassService.getSessionPolicy()
          const scheduledMs = new Date(bookingMeta.scheduledAt).getTime()
          const now = Date.now()
          const graceMs = (policy.teacherGraceMinutes ?? 30) * 60 * 1000
          const unlockBeforeMs = (policy.unlockBeforeMinutes ?? 5) * 60 * 1000

          // Check if teacher exceeded 30 minutes grace period
          if (!bookingMeta.teacherJoinedAt && now > scheduledMs + graceMs) {
            await OnlineClassService.handleTeacherNoShow(bookingMeta)
            res.status(410).json({
              success: false,
              code: 'TEACHER_NO_SHOW',
              message:
                'به دلیل عدم حضور دبیر ظرف ۳۰ دقیقه پس از ساعت مقرر، کلاس لغو و مبلغ پرداختی به کیف پول دانش‌آموز مسترد گردید.',
            })
            return
          }

          // Check if room is still locked (more than 5 mins before start)
          const unlockTime = scheduledMs - unlockBeforeMs
          if (now < unlockTime) {
            const remainingSeconds = Math.ceil((unlockTime - now) / 1000)
            res.status(423).json({
              success: false,
              isLocked: true,
              code: 'CLASS_LOCKED',
              message: `کلاس آنلاین قفل است و ${policy.unlockBeforeMinutes} دقیقه قبل از شروع کلاس باز می‌شود.`,
              unlocksAt: new Date(unlockTime),
              scheduledAt: bookingMeta.scheduledAt,
              remainingSeconds,
            })
            return
          }
        }

        const cleanCode = (bookingMeta?.bookingCode || source.sourceId).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
        const roomName = bookingMeta?.meeting?.roomName || `kitayar-class-${cleanCode}`

        session = await ClassroomSession.findOne({ roomName })
        if (!session) {
          session = await ClassroomSession.create({
            bookingId: source.sourceType === 'online_class_booking' ? new Types.ObjectId(source.sourceId) : undefined,
            bookingCode: bookingMeta?.bookingCode || (Types.ObjectId.isValid(sessionId) ? undefined : sessionId),
            sourceType: source.sourceType,
            provider: 'internal',
            uiMode: 'online_class',
            roomName,
            plugNmeetRoomId: roomName,
            teacherId: Types.ObjectId.isValid(source.teacherId) ? new Types.ObjectId(source.teacherId) : undefined,
            studentId: Types.ObjectId.isValid(source.studentId) ? new Types.ObjectId(source.studentId) : undefined,
            invitedStudentIds: source.invitedStudentIds.filter(id => Types.ObjectId.isValid(id)).map(id => new Types.ObjectId(id)),
            title: source.title || 'کلاس رفع اشکال آنلاین',
            topic: source.topic,
            status: 'waiting',
            maxParticipants: Math.max(12, Number(bookingMeta?.capacity || 0) + 2),
          })
        }
      }

      if (!session) {
        res.status(404).json({ success: false, message: 'کلاس آنلاین مورد نظر یافت نشد' })
        return
      }

      if (['completed', 'expired', 'cancelled'].includes(session.status)) {
        res.status(410).json({ success: false, message: 'این کلاس آنلاین قبلاً خاتمه یافته یا لغو شده است' })
        return
      }

      let isAdmin = false
      let role: 'teacher' | 'student' = 'student'
      let participantName = 'شرکت‌کننده'
      let participantIdentity = ''

      if (resolvedTicket) {
        const foundTicket = session.inviteTickets?.find((t) => t.ticketCode === resolvedTicket)
        if (!foundTicket) {
          res.status(403).json({ success: false, message: 'لینک یا بلیت دعوت نامعتبر است' })
          return
        }

        isAdmin = foundTicket.role === 'teacher'
        role = isAdmin ? 'teacher' : 'student'
        participantName = guestName?.trim() || foundTicket.name || (isAdmin ? 'استاد کلاس' : 'دانش‌آموز')
        participantIdentity = foundTicket.userId?.toString() || foundTicket.ticketCode

        if (!linkOnly && !foundTicket.isUsed) {
          foundTicket.isUsed = true
          foundTicket.usedAt = new Date()
          await session.save()
        }
      } else {
        if (session.sourceType === 'online_class_booking') {
          if (!user) {
            res.status(401).json({ success: false, message: 'لطفاً وارد حساب کاربری خود شوید یا با لینک معتبر عضویت وارد شوید' })
            return
          }
          if (source && !source.isJoinableStatus()) {
            res.status(403).json({
              success: false,
              message: ['completed', 'cancelled', 'rejected', 'refunded'].includes(source.status)
                ? 'این کلاس به پایان رسیده یا لغو شده است و امکان ورود مجدد وجود ندارد.'
                : 'این کلاس هنوز توسط معلم تایید نهایی نشده است.',
            })
            return
          }
          const hasAccess =
            user.role === 'admin' ||
            session.teacherId?.toString() === user.userId ||
            session.studentId?.toString() === user.userId ||
            (session.invitedStudentIds || []).some((id) => id.toString() === user.userId) ||
            (source ? await source.canAccess(user.userId, user.role) : false)
          if (!hasAccess) {
            res.status(403).json({ success: false, message: 'شما عضو تاییدشده این کلاس نیستید و مجاز به ورود به کلاس نیستید.' })
            return
          }
        }

        if (user) {
          const isClassTeacher = Boolean(session.teacherId && session.teacherId.toString() === user.userId)
          const isClassStudent = Boolean(
            (session.studentId && session.studentId.toString() === user.userId) ||
            (session.invitedStudentIds || []).some((id) => id.toString() === user.userId)
          )

          let isTeacherRole = false
          if (session.teacherId) {
            isTeacherRole = isClassTeacher || (user.role === 'admin' && !isClassStudent)
          } else {
            isTeacherRole = (user.role === 'teacher' || user.role === 'admin') && !isClassStudent
          }

          isAdmin = isTeacherRole
          role = isAdmin ? 'teacher' : 'student'
          participantName = user.name || (isAdmin ? 'استاد کلاس' : 'دانش‌آموز')
          participantIdentity = user.userId

          // Idempotent personal invite ticket bound to userId for direct web browser access & single-device enforcement
          if (!session.inviteTickets) session.inviteTickets = []
          let personalTicket = session.inviteTickets.find(
            (t) => t.userId?.toString() === user.userId && t.role === role
          )
          if (!personalTicket) {
            personalTicket = {
              ticketCode: `inv-${isAdmin ? 'tch' : 'std'}-${crypto.randomBytes(6).toString('hex')}`,
              role,
              name: participantName,
              userId: Types.ObjectId.isValid(user.userId) ? new Types.ObjectId(user.userId) : undefined,
              createdAt: new Date(),
              isUsed: false,
            }
            session.inviteTickets.push(personalTicket)
            await session.save()
          }
          resolvedTicket = personalTicket.ticketCode
        } else {
          participantName = guestName?.trim() || 'دانش‌آموز مهمان'
          participantIdentity = `guest_${Date.now()}`
        }
      }

      const roomId = session.roomName || session.plugNmeetRoomId || sessionId
      if (!linkOnly) {
        await RoomManager.getOrCreateRoom(roomId, session.title, session.teacherId?.toString(), session.maxParticipants || 20)

        if (isAdmin && session.bookingId) {
          try {
            const booking = await OnlineClassBooking.findById(session.bookingId)
            if (booking && !booking.teacherJoinedAt) {
              const policy = await OnlineClassService.getSessionPolicy()
              booking.teacherJoinedAt = new Date()
              const timing = OnlineClassService.calculateClassEndTime(
                booking.scheduledAt,
                booking.teacherJoinedAt,
                booking.durationMinutes || 90,
                policy.extraMinutes ?? 5
              )
              booking.effectiveStartAt = timing.effectiveStartAt
              booking.endsAt = timing.endsAt
              booking.status = 'in_progress'
              await booking.save()
            }
          } catch (bErr) {
            logger.warn('[PlugNmeetController] Error updating booking start timing on teacher join:', bErr)
          }
        }

        if (session.status === 'waiting') {
          session.status = 'active'
          session.startedAt = session.startedAt || new Date()
          await session.save()
        }
        if (source) {
          await source.markInProgress()
        }
      }

      const baseClassUrl = process.env.CLASSROOM_PUBLIC_URL || 'https://class.kitayar.ir'
      const webJoinUrl = resolvedTicket
        ? `${baseClassUrl}/classroom/native/${encodeURIComponent(roomId)}?ticket=${encodeURIComponent(resolvedTicket)}`
        : `${baseClassUrl}/classroom/native/${encodeURIComponent(roomId)}`
      const directUrl = `${webJoinUrl}${webJoinUrl.includes('?') ? '&' : '?'}platform=app`

      res.status(200).json({
        success: true,
        message: 'مجوز ورود به کلاس آنلاین با موفقیت صادر گردید',
        data: {
          token: resolvedTicket || participantIdentity,
          ticketCode: resolvedTicket || undefined,
          serverUrl: baseClassUrl,
          webJoinUrl,
          directUrl,
          roomId,
          title: session.title,
          topic: session.topic,
          teacherName: session.teacherName || 'استاد کلاس',
          participant: {
            identity: participantIdentity,
            name: participantName,
            role,
            isAdmin,
          },
          session: {
            _id: session._id,
            roomName: roomId,
            status: session.status,
            provider: 'internal',
          },
        },
      })
    } catch (error: any) {
      logger.error('[Classroom] getJoinToken error:', error)
      res.status(500).json({
        success: false,
        message: error.message || 'خطا در صدور مجوز ورود به کلاس آنلاین',
      })
    }
  }

  static async getClientFiles(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      data: {
        serverUrl: 'https://class.kitayar.ir',
        css: [],
        js: [],
      },
    })
  }

  static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId
      let session = null
      if (Types.ObjectId.isValid(sessionId)) {
        session = await ClassroomSession.findById(sessionId)
      }
      if (!session) {
        session = await ClassroomSession.findOne({
          $or: [{ roomName: sessionId }, { plugNmeetRoomId: sessionId }],
        })
      }

      if (!session) {
        res.status(404).json({ success: false, message: 'کلاس یافت نشد' })
        return
      }

      const roomId = session.roomName
      const activeRoom = RoomManager.getRoom(roomId)

      res.status(200).json({
        success: true,
        data: {
          sessionStatus: session.status,
          plugNmeet: {
            roomId,
            isRunning: !!activeRoom && activeRoom.status === 'active',
          },
          inviteTickets: session.inviteTickets,
        },
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'خطا در دریافت وضعیت کلاس',
      })
    }
  }

  static async endSession(req: Request, res: Response): Promise<void> {
    try {
      const user = AuthAdapter.getUser(req)
      if (!user) {
        res.status(401).json({ success: false, message: 'دسترسی غیرمجاز' })
        return
      }

      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId
      let session = null
      if (Types.ObjectId.isValid(sessionId)) {
        session = await ClassroomSession.findById(sessionId)
      }
      if (!session) {
        session = await ClassroomSession.findOne({
          $or: [{ roomName: sessionId }, { plugNmeetRoomId: sessionId }],
        })
      }

      if (!session) {
        res.status(404).json({ success: false, message: 'کلاس یافت نشد' })
        return
      }

      const roomId = session.roomName
      RoomManager.endRoom(roomId)

      session.status = 'completed'
      session.endedAt = new Date()
      if (session.startedAt) {
        session.durationSeconds = Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
      }
      await session.save()

      res.status(200).json({
        success: true,
        message: 'کلاس آنلاین با موفقیت پایان یافت',
        durationSeconds: session.durationSeconds,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'خطا در بستن کلاس آنلاین',
      })
    }
  }
}
