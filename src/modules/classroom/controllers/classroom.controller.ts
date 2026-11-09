import { Request, Response } from 'express'
import { ClassroomService } from '../services/classroom.service.js'
import { AuthAdapter } from '../adapters/AuthAdapter.js'
import { LiveKitRtcProvider } from '../adapters/RtcProvider.js'
import { ClassroomPricing } from '../../../core/models/ClassroomPricing.js'
import { logger } from '../../../core/utils/logger.js'

const classroomService = new ClassroomService()
const rtcProvider = new LiveKitRtcProvider()

export class ClassroomController {
  /**
   * POST /api/classroom/rooms/:sessionId/token
   * Issues LiveKit access token and room parameters for authenticated participant or ticket holder
   */
  static async joinSessionToken(req: Request, res: Response): Promise<void> {
    try {
      const user = AuthAdapter.getUser(req)
      const { clientPlatform, ticket, guestName } = req.body
      const ticketCode = ticket || (req.query?.ticket as string)

      if (!ticketCode && !user) {
        res.status(401).json({
          success: false,
          message: 'لطفاً وارد حساب کاربری خود شوید یا با لینک معتبر عضویت وارد شوید',
        })
        return
      }

      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId

      const result = await classroomService.joinSession(
        sessionId,
        user,
        clientPlatform,
        ticketCode,
        guestName
      )

      res.status(200).json({
        success: true,
        message: 'توکن کلاس آنلاین با موفقیت صادر شد',
        data: result,
      })
    } catch (error: any) {
      logger.error('[ClassroomController] joinSessionToken error:', error)
      const statusCode = error.statusCode || 500
      res.status(statusCode).json({
        success: false,
        message: error.message || 'خطا در صدور مجوز ورود به کلاس آنلاین',
      })
    }
  }

  /**
   * POST /api/classroom/admin/create-session
   * Admin creates an online classroom with configurable membership tickets
   */
  static async createAdHocSession(req: Request, res: Response): Promise<void> {
    try {
      const user = AuthAdapter.getUser(req)
      if (!user) {
        res.status(401).json({ success: false, message: 'دسترسی غیرمجاز' })
        return
      }

      const { title, topic, teacherName, studentCount, tickets } = req.body

      if (!title || !title.trim()) {
        res.status(400).json({ success: false, message: 'عنوان کلاس الزامی است' })
        return
      }

      const session = await classroomService.createAdHocSession({
        title: title.trim(),
        topic: topic?.trim(),
        teacherName: teacherName?.trim(),
        studentCount: Number(studentCount) || 2,
        tickets,
        adminUser: user,
      })

      res.status(201).json({
        success: true,
        message: 'کلاس آنلاین با موفقیت ایجاد شد و لینک‌های عضویت صادر گردیدند',
        data: session,
      })
    } catch (error: any) {
      logger.error('[ClassroomController] createAdHocSession error:', error)
      res.status(500).json({
        success: false,
        message: error.message || 'خطا در ایجاد کلاس آنلاین',
      })
    }
  }

  /**
   * POST /api/classroom/rooms/:sessionId/tickets
   * Adds more tickets to an existing session
   */
  static async addTickets(req: Request, res: Response): Promise<void> {
    try {
      const user = AuthAdapter.getUser(req)
      if (!user) {
        res.status(401).json({ success: false, message: 'دسترسی غیرمجاز' })
        return
      }

      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId
      const { count, role, namePrefix, tickets } = req.body

      const result = await classroomService.addTicketsToSession(sessionId, {
        count: Number(count) || 1,
        role: role || 'student',
        namePrefix,
        tickets,
      })

      res.status(200).json({
        success: true,
        message: 'لینک‌های جدید با موفقیت اضافه شدند',
        data: result,
      })
    } catch (error: any) {
      logger.error('[ClassroomController] addTickets error:', error)
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'خطا در افزودن لینک‌های عضویت',
      })
    }
  }

  /**
   * GET /api/classroom/rooms/:sessionId/tickets
   * Retrieves all membership tickets for a session
   */
  static async listTickets(req: Request, res: Response): Promise<void> {
    try {
      const user = AuthAdapter.getUser(req)
      if (!user) {
        res.status(401).json({ success: false, message: 'دسترسی غیرمجاز' })
        return
      }

      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId
      const result = await classroomService.listTickets(sessionId)

      res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error: any) {
      logger.error('[ClassroomController] listTickets error:', error)
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'خطا در دریافت لیست لینک‌های عضویت',
      })
    }
  }

  /**
   * GET /api/classroom/monitoring/sessions
   * Admin monitoring of all online classes
   */
  static async listSessions(req: Request, res: Response): Promise<void> {
    try {
      const user = AuthAdapter.getUser(req)
      if (!user) {
        res.status(401).json({ success: false, message: 'دسترسی غیرمجاز' })
        return
      }

      const { status } = req.query
      const sessions = await classroomService.listSessions({ status: status as string })

      res.status(200).json({
        success: true,
        data: sessions,
      })
    } catch (error: any) {
      logger.error('[ClassroomController] listSessions error:', error)
      res.status(500).json({ success: false, message: 'خطا در دریافت لیست جلسات' })
    }
  }

  /**
   * GET /api/classroom/rooms/:sessionId/status
   * Live metrics and state of a classroom session
   */
  static async getSessionStatus(req: Request, res: Response): Promise<void> {
    try {
      const user = AuthAdapter.getUser(req)
      if (!user) {
        res.status(401).json({ success: false, message: 'دسترسی غیرمجاز' })
        return
      }

      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId
      const statusData = await classroomService.getSessionStatus(sessionId, user)

      res.status(200).json({
        success: true,
        data: statusData,
      })
    } catch (error: any) {
      logger.error('[ClassroomController] getSessionStatus error:', error)
      const statusCode = error.statusCode || 500
      res.status(statusCode).json({
        success: false,
        message: error.message || 'خطا در دریافت وضعیت کلاس',
      })
    }
  }

  /**
   * POST /api/classroom/rooms/:sessionId/end
   * Ends live session, disconnects SFU room and finalizes booking status
   */
  static async endSession(req: Request, res: Response): Promise<void> {
    try {
      const user = AuthAdapter.getUser(req)
      if (!user) {
        res.status(401).json({ success: false, message: 'دسترسی غیرمجاز' })
        return
      }

      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId
      const result = await classroomService.endSession(sessionId, user)

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      })
    } catch (error: any) {
      logger.error('[ClassroomController] endSession error:', error)
      const statusCode = error.statusCode || 500
      res.status(statusCode).json({
        success: false,
        message: error.message || 'خطا در پایان دادن به کلاس',
      })
    }
  }

  /**
   * POST /api/classroom/rooms/:sessionId/sync
   * Heartbeat presence, participant list, whiteboard strokes and event exchange
   */
  static async syncSession(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId
      const result = await classroomService.syncSession(sessionId, req.body)
      res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error: any) {
      logger.error('[ClassroomController] syncSession error:', error)
      const statusCode = error.statusCode || 500
      res.status(statusCode).json({
        success: false,
        message: error.message || 'خطا در همگام‌سازی وضعیت کلاس',
      })
    }
  }

  /**
   * POST /api/classroom/rooms/:sessionId/whiteboard/snapshot
   * Persists whiteboard stroke state
   */
  static async saveWhiteboard(req: Request, res: Response): Promise<void> {
    try {
      const user = AuthAdapter.getUser(req)
      if (!user) {
        res.status(401).json({ success: false, message: 'دسترسی غیرمجاز' })
        return
      }

      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId
      const { elements, viewport } = req.body

      const result = await classroomService.saveWhiteboardSnapshot(
        sessionId,
        { elements, viewport },
        user
      )

      res.status(200).json({
        success: true,
        message: 'اسنپ‌شات تخته سفید ذخیره شد',
        data: result,
      })
    } catch (error: any) {
      logger.error('[ClassroomController] saveWhiteboard error:', error)
      const statusCode = error.statusCode || 500
      res.status(statusCode).json({
        success: false,
        message: error.message || 'خطا در ذخیره وضعیت تخته',
      })
    }
  }

  /**
   * GET /api/classroom/rooms/:sessionId/whiteboard/snapshot
   * Retrieves latest saved whiteboard state
   */
  static async getWhiteboard(req: Request, res: Response): Promise<void> {
    try {
      const user = AuthAdapter.getUser(req)
      if (!user) {
        res.status(401).json({ success: false, message: 'دسترسی غیرمجاز' })
        return
      }

      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId
      const snapshot = await classroomService.getWhiteboardSnapshot(sessionId, user)

      res.status(200).json({
        success: true,
        data: snapshot,
      })
    } catch (error: any) {
      logger.error('[ClassroomController] getWhiteboard error:', error)
      const statusCode = error.statusCode || 500
      res.status(statusCode).json({
        success: false,
        message: error.message || 'خطا در بازیابی وضعیت تخته',
      })
    }
  }

  /**
   * POST /api/classroom/webhooks/livekit
   * Receives verified LiveKit lifecycle events
   */
  static async handleLiveKitWebhook(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader) {
        res.status(401).json({ success: false, message: 'فاقد هدر احراز هویت وب‌هوک' })
        return
      }

      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)

      // Verify HMAC signature
      const event = await rtcProvider.verifyWebhook(rawBody, authHeader)

      // Process event in background / service
      await classroomService.handleWebhookEvent(event)

      res.status(200).json({ success: true })
    } catch (error: any) {
      logger.warn('[ClassroomController] LiveKit webhook verification rejected:', error.message)
      res.status(401).json({ success: false, message: 'امضای وب‌هوک نامعتبر است' })
    }
  }

  /**
   * GET /api/classroom/pricing
   * Retrieve classroom pricing settings
   */
  static async getPricing(req: Request, res: Response): Promise<void> {
    try {
      let pricing = await ClassroomPricing.findOne({ key: 'default' })
      if (!pricing) {
        pricing = await ClassroomPricing.create({
          key: 'default',
          isFree: false,
          only90Min: false,
          durationPrices: {
            d15: 15000,
            d30: 25000,
            d45: 35000,
            d60: 40000,
            d75: 45000,
            d90: 50000,
          },
          extraStudentPrice: 50000,
        })
      }
      res.status(200).json({ success: true, data: pricing })
    } catch (error: any) {
      logger.error('[ClassroomController] getPricing error:', error)
      res.status(500).json({ success: false, message: 'خطا در دریافت تعرفه کلاس آنلاین' })
    }
  }

  /**
   * PUT /api/classroom/pricing
   * Admin update classroom pricing settings
   */
  static async updatePricing(req: Request, res: Response): Promise<void> {
    try {
      const { isFree, only90Min, durationPrices, extraStudentPrice } = req.body
      let pricing = await ClassroomPricing.findOne({ key: 'default' })
      if (!pricing) {
        pricing = new ClassroomPricing({ key: 'default' })
      }

      if (typeof isFree === 'boolean') pricing.isFree = isFree
      if (typeof only90Min === 'boolean') pricing.only90Min = only90Min

      if (durationPrices && typeof durationPrices === 'object') {
        pricing.durationPrices = {
          d15: Math.max(0, Number(durationPrices.d15) || 0),
          d30: Math.max(0, Number(durationPrices.d30) || 0),
          d45: Math.max(0, Number(durationPrices.d45) || 0),
          d60: Math.max(0, Number(durationPrices.d60) || 0),
          d75: Math.max(0, Number(durationPrices.d75) || 0),
          d90: Math.max(0, Number(durationPrices.d90) || 0),
        }
      }

      if (extraStudentPrice !== undefined) {
        pricing.extraStudentPrice = Math.max(0, Number(extraStudentPrice) || 0)
      }

      await pricing.save()

      res.status(200).json({
        success: true,
        message: 'تنظیمات و تعرفه کلاس آنلاین با موفقیت ذخیره شد',
        data: pricing,
      })
    } catch (error: any) {
      logger.error('[ClassroomController] updatePricing error:', error)
      res.status(500).json({ success: false, message: 'خطا در ذخیره تعرفه کلاس آنلاین' })
    }
  }
}
