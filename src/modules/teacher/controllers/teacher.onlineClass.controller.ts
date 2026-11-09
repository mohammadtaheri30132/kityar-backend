import { Request, Response } from 'express'
import { OnlineClassBooking } from '../../../core/models/OnlineClassBooking.js'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { OnlineClassService } from '../../../core/services/onlineClass.service.js'
import { WalletService } from '../../../core/services/wallet.service.js'

export class TeacherOnlineClassController {
  /**
   * GET /api/teacher/center/online-class-settings
   * Retrieve teacher's 90-min base price and calculated duration prices
   */
  static async getSettings(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      let profile = await TeacherProfile.findOne({ user: userId })

      if (!profile) {
        profile = await TeacherProfile.create({
          user: userId,
          category: 'آموزگار',
          position: 'معلم',
          schools: [],
          resume: { experiences: [], education: [], skills: [], certificates: [], honors: [] },
          availabilityStatus: 'offline',
          acceptingQuestions: true,
          questionFee: 0,
          hourlyRate: 0,
          onlineClassBasePrice: 500000,
        })
      }

      const basePrice = profile.onlineClassBasePrice || 500000
      const durationTable = OnlineClassService.getDurationPrices(
        basePrice,
        profile.onlineClassDurations
      )

      return res.json({
        success: true,
        data: {
          basePrice90Min: basePrice,
          durations: durationTable,
        },
      })
    } catch (error: any) {
      console.error('Error fetching teacher online class settings:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/teacher/center/online-class-settings
   * Update 90-min base price and toggle duration options
   */
  static async updateSettings(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { basePrice90Min, durations } = req.body

      const numBasePrice = Number(basePrice90Min)
      if (isNaN(numBasePrice) || numBasePrice < 10000) {
        return res.status(400).json({
          success: false,
          message: 'قیمت پایه ۹۰ دقیقه باید حداقل ۱۰,۰۰۰ تومان باشد.',
        })
      }

      const updateData: any = {
        onlineClassBasePrice: numBasePrice,
      }

      if (durations && typeof durations === 'object') {
        const durationsMap: Record<string, boolean> = {}
        ;[15, 30, 45, 60, 75, 90].forEach((m) => {
          durationsMap[m.toString()] =
            durations[m.toString()] !== undefined ? Boolean(durations[m.toString()]) : true
        })
        updateData.onlineClassDurations = durationsMap
      }

      const updatedProfile = await TeacherProfile.findOneAndUpdate(
        { user: userId },
        { $set: updateData },
        { new: true, upsert: true }
      )

      const durationTable = OnlineClassService.getDurationPrices(
        updatedProfile.onlineClassBasePrice || 500000,
        updatedProfile.onlineClassDurations
      )

      return res.json({
        success: true,
        message: 'تنظیمات قیمت و زمان‌بندی کلاس آنلاین با موفقیت ذخیره شد.',
        data: {
          basePrice90Min: updatedProfile.onlineClassBasePrice,
          durations: durationTable,
        },
      })
    } catch (error: any) {
      console.error('Error updating online class settings:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * GET /api/teacher/center/class-requests
   * List booking requests made to this teacher
   */
  static async getClassRequests(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { tab } = req.query // 'pending' | 'upcoming' | 'history' | 'all'

      let query: any = { teacherId: userId }

      if (tab === 'pending') {
        query.status = 'paid_pending_teacher'
      } else if (tab === 'upcoming') {
        query.status = { $in: ['confirmed', 'in_progress'] }
      } else if (tab === 'history') {
        query.status = { $in: ['completed', 'rejected', 'cancelled', 'refunded', 'expired'] }
      }

      const bookings = await OnlineClassBooking.find(query)
        .populate('studentId', 'fullName avatar phoneNumber')
        .populate('invitedStudents.studentId', 'fullName avatar phoneNumber')
        .sort({ scheduledAt: -1 })

      return res.json({ success: true, data: bookings })
    } catch (error: any) {
      console.error('Error fetching teacher class requests:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/teacher/center/class-requests/:id/accept
   * Accept an online class booking request
   */
  static async acceptRequest(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params

      const booking = await OnlineClassBooking.findOne({
        _id: id,
        teacherId: userId,
        status: 'paid_pending_teacher',
      })

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'درخواست کلاسی در انتظار پذیرش یافت نشد یا قبلاً تعیین تکلیف شده است.',
        })
      }

      // Check conflict
      const conflict = await OnlineClassBooking.findOne({
        _id: { $ne: booking._id },
        teacherId: userId,
        status: { $in: ['confirmed', 'in_progress'] },
        scheduledAt: { $lt: booking.endTime },
        endTime: { $gt: booking.scheduledAt },
      })

      if (conflict) {
        return res.status(409).json({
          success: false,
          message: 'شما کلاس تاییدشده دیگری در این بازه زمانی دارید. امکان تایید همزمان وجود ندارد.',
        })
      }

      // Ensure meeting link
      if (!booking.meeting?.meetingLink) {
        booking.meeting = OnlineClassService.generateMeetingInfo(booking.bookingCode)
      }

      booking.status = 'confirmed'
      await booking.save()

      return res.json({
        success: true,
        message: 'کلاس با موفقیت تایید شد و لینک جلسه فعال گردید.',
        data: booking,
      })
    } catch (error: any) {
      console.error('Error accepting class request:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/teacher/center/class-requests/:id/reject
   * Reject class booking request with automatic mock refund
   */
  static async rejectRequest(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params
      const { reason } = req.body

      const booking = await OnlineClassBooking.findOne({
        _id: id,
        teacherId: userId,
        status: { $in: ['paid_pending_teacher', 'confirmed'] },
      })

      if (!booking) {
        return res.status(404).json({ success: false, message: 'درخواست کلاس یافت نشد.' })
      }

      booking.status = 'rejected'
      booking.rejectionReason = reason ? reason.trim() : 'عدم امکان برگزاری در زمان درخواستی'

      // Mock refund
      if (booking.payment?.isPaid) {
        booking.status = 'refunded'
      }

      await booking.save()

      return res.json({
        success: true,
        message: 'درخواست کلاس رد شد و وجه آزمایشی به دانش‌آموز بازگردانده شد.',
        data: booking,
      })
    } catch (error: any) {
      console.error('Error rejecting class request:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/teacher/center/class-requests/:id/complete
   * Mark class as completed and settle teacher earnings to wallet
   */
  static async completeClass(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params

      const booking = await OnlineClassBooking.findOne({
        _id: id,
        teacherId: userId,
        status: { $in: ['confirmed', 'in_progress'] },
      })

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'کلاس تاییدشده‌ای جهت پایان یافتن پیدا نشد.',
        })
      }

      booking.status = 'completed'
      await booking.save()

      // Credit teacher wallet
      const earnings = booking.pricing?.teacherEarnings || 0
      if (earnings > 0) {
        await WalletService.credit({
          userId,
          userType: 'teacher',
          amount: earnings,
          type: 'class_earning',
          description: `درآمد حاصل از برگزاری کلاس آنلاین: ${booking.topic} (${booking.subjectName})`,
          referenceId: booking._id.toString(),
          referenceModel: 'OnlineClassBooking',
        })
      }

      return res.json({
        success: true,
        message: 'کلاس با موفقیت به پایان رسید و سهم درآمد شما به کیف پول واریز شد.',
        data: {
          booking,
          earnings,
        },
      })
    } catch (error: any) {
      console.error('Error completing class:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }
}

