import { Request, Response } from 'express'
import { Types } from 'mongoose'
import { ClassroomSession, IClassroomTicket } from '../models/ClassroomSession.js'
import { RoomManager } from '../native/services/RoomManager.js'
import { AuthAdapter } from '../adapters/AuthAdapter.js'
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
        maxParticipants = 20,
      } = req.body

      if (!title || !title.trim()) {
        res.status(400).json({ success: false, message: 'عنوان کلاس الزامی است' })
        return
      }

      const randomSuffix = Math.random().toString(36).substring(2, 7)
      const roomId = `kitayar-${Date.now().toString(36)}-${randomSuffix}`
      const cleanTitle = title.trim()

      // Generate Invite Tickets for Teacher and Students
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
          name: teacherName || 'استاد کلاس',
          createdAt: new Date(),
          isUsed: false,
        })

        const count = Math.max(1, Math.min(100, Number(studentCount) || 1))
        for (let i = 1; i <= count; i++) {
          const studentTicketCode = `inv-std-${Date.now().toString(36)}-${i}-${Math.random().toString(36).substring(2, 6)}`
          generatedTickets.push({
            ticketCode: studentTicketCode,
            role: 'student',
            name: `دانش‌آموز ${i}`,
            createdAt: new Date(),
            isUsed: false,
          })
        }
      }

      const maxCap = Math.max(Number(maxParticipants) || 20, generatedTickets.length + 5)

      const session = await ClassroomSession.create({
        sourceType: 'ad_hoc',
        provider: 'internal',
        roomName: roomId,
        plugNmeetRoomId: roomId,
        title: cleanTitle,
        topic: topic?.trim() || '',
        teacherName: teacherName?.trim() || 'استاد کلاس',
        teacherId: user.userId && Types.ObjectId.isValid(user.userId) ? new Types.ObjectId(user.userId) : undefined,
        status: 'waiting',
        maxParticipants: maxCap,
        inviteTickets: generatedTickets,
      })

      await RoomManager.getOrCreateRoom(roomId, cleanTitle, user.userId, maxCap)

      logger.info(`[NativeClassroom] Created ClassroomSession ${session._id} (room: ${roomId})`)

      res.status(201).json({
        success: true,
        message: 'کلاس آنلاین اختصاصی کیتایار با موفقیت ایجاد شد',
        data: session,
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

      let session = null
      if (Types.ObjectId.isValid(sessionId)) {
        session = await ClassroomSession.findById(sessionId)
      }
      if (!session) {
        session = await ClassroomSession.findOne({
          $or: [
            { roomName: sessionId },
            { plugNmeetRoomId: sessionId },
            { bookingCode: sessionId },
            { 'inviteTickets.ticketCode': sessionId },
            { 'inviteTickets.ticketCode': ticketCode },
          ],
        })
      }

      if (!session) {
        res.status(404).json({ success: false, message: 'کلاس آنلاین مورد نظر یافت نشد' })
        return
      }

      if (session.status === 'completed' || session.status === 'expired') {
        res.status(410).json({ success: false, message: 'این کلاس آنلاین قبلاً خاتمه یافته است' })
        return
      }

      let isAdmin = false
      let role: 'teacher' | 'student' = 'student'
      let participantName = 'شرکت‌کننده'
      let participantIdentity = ''
      let resolvedTicket = ticketCode

      if (!resolvedTicket && sessionId.startsWith('inv-')) {
        resolvedTicket = sessionId
      }

      if (resolvedTicket) {
        const foundTicket = session.inviteTickets?.find((t) => t.ticketCode === resolvedTicket)
        if (!foundTicket) {
          res.status(403).json({ success: false, message: 'لینک یا بلیت دعوت نامعتبر است' })
          return
        }

        isAdmin = foundTicket.role === 'teacher'
        role = isAdmin ? 'teacher' : 'student'
        participantName = guestName?.trim() || foundTicket.name || (isAdmin ? 'استاد کلاس' : 'دانش‌آموز')
        participantIdentity = foundTicket.ticketCode

        if (!foundTicket.isUsed) {
          foundTicket.isUsed = true
          foundTicket.usedAt = new Date()
          await session.save()
        }
      } else {
        const user = AuthAdapter.getUser(req)
        if (user) {
          const isTeacherRole =
            user.role === 'teacher' ||
            user.role === 'admin' ||
            (session.teacherId && session.teacherId.toString() === user.userId)

          isAdmin = !!isTeacherRole
          role = isAdmin ? 'teacher' : 'student'
          participantName = user.name || (isAdmin ? 'استاد کلاس' : 'دانش‌آموز')
          participantIdentity = user.userId
        } else {
          participantName = guestName?.trim() || 'دانش‌آموز مهمان'
          participantIdentity = `guest_${Date.now()}`
        }
      }

      const roomId = session.roomName || session.plugNmeetRoomId || sessionId
      await RoomManager.getOrCreateRoom(roomId, session.title, session.teacherId?.toString(), session.maxParticipants || 20)

      if (session.status === 'waiting') {
        session.status = 'active'
        session.startedAt = session.startedAt || new Date()
        await session.save()
      }

      const baseClassUrl = process.env.CLASSROOM_PUBLIC_URL || 'https://class.kitayar.ir'
      const directUrl = `${baseClassUrl}/classroom/native/${encodeURIComponent(roomId)}?ticket=${encodeURIComponent(resolvedTicket || '')}&platform=app`

      res.status(200).json({
        success: true,
        message: 'مجوز ورود به کلاس آنلاین با موفقیت صادر گردید',
        data: {
          token: resolvedTicket || participantIdentity,
          serverUrl: baseClassUrl,
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
