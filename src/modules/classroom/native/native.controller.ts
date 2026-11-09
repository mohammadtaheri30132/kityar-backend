import { Request, Response } from 'express'
import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'
import { ClassroomSession } from '../models/ClassroomSession.js'
import { RoomManager } from './services/RoomManager.js'
import { NativeSignalingServer } from './ws/NativeSignalingServer.js'
import { AuthAdapter } from '../adapters/AuthAdapter.js'
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

  /**
   * Get metadata and public info of a native room
   */
  static async getRoomInfo(req: Request, res: Response) {
    try {
      const roomId = req.params.roomId as string
      let session = null
      if (mongoose.isValidObjectId(roomId)) {
        session = await ClassroomSession.findById(roomId)
      }
      if (!session) {
        session = await ClassroomSession.findOne({
          $or: [
            { roomName: roomId },
            { plugNmeetRoomId: roomId },
            { bookingCode: roomId },
            { 'inviteTickets.ticketCode': roomId },
          ],
        })
      }

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
            provider: 'internal',
          },
        })
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
          provider: 'internal',
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
        },
      })
    } catch (err: any) {
      return res.status(500).json({ success: false, message: 'خطا در دریافت وضعیت زنده کلاس' })
    }
  }
}
