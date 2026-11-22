import { Request, Response } from 'express'
import { OnlineClassBooking } from '../../../core/models/OnlineClassBooking.js'
import { OnlineClassMembership } from '../../../core/models/OnlineClassMembership.js'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { User } from '../../../core/models/User.js'
import { OnlineClassService } from '../../../core/services/onlineClass.service.js'
import { WalletService } from '../../../core/services/wallet.service.js'
import { SmsService } from '../../../core/services/sms.service.js'
import { NotificationService } from '../../../core/services/notificationService.js'
import { withTeacherBookingLock } from '../../../core/utils/bookingSlotLock.js'
import {
  extractWeeklyScheduleSummary,
  validateAndNormalizeWeeklySchedule,
} from '../../../core/utils/weeklySchedule.js'

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
      const weeklySummary = extractWeeklyScheduleSummary(profile.weeklySchedule)

      return res.json({
        success: true,
        data: {
          basePrice90Min: basePrice,
          durations: durationTable,
          weeklySchedule: weeklySummary.schedule,
          enabledDaysCount: weeklySummary.enabledDaysCount,
          totalSlotsCount: weeklySummary.totalSlotsCount,
          educationLevel: profile.educationLevel || 'both',
          teachingSubjects: profile.teachingSubjects || [],
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
      const { basePrice90Min, onlineClassBasePrice, durations, weeklySchedule } = req.body

      const updateData: any = {}

      const rawPrice = basePrice90Min !== undefined ? basePrice90Min : onlineClassBasePrice
      if (rawPrice !== undefined) {
        const numBasePrice = Number(rawPrice)
        if (isNaN(numBasePrice) || numBasePrice < 10000) {
          return res.status(400).json({
            success: false,
            message: 'قیمت پایه ۹۰ دقیقه باید حداقل ۱۰,۰۰۰ تومان باشد.',
          })
        }
        updateData.onlineClassBasePrice = numBasePrice
      }

      if (durations && typeof durations === 'object') {
        const durationsMap: Record<string, boolean> = {}
        ;[15, 30, 45, 60, 75, 90].forEach((m) => {
          durationsMap[m.toString()] =
            durations[m.toString()] !== undefined ? Boolean(durations[m.toString()]) : true
        })
        updateData.onlineClassDurations = durationsMap
      }

      if (weeklySchedule !== undefined) {
        const validation = validateAndNormalizeWeeklySchedule(weeklySchedule)
        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            message: validation.error,
          })
        }
        updateData.weeklySchedule = validation.schedule
      }

      // Updating weekly schedule must NOT cancel or modify existing confirmed/in_progress bookings
      const updatedProfile = await TeacherProfile.findOneAndUpdate(
        { user: userId },
        { $set: updateData },
        { new: true, upsert: true }
      )

      const durationTable = OnlineClassService.getDurationPrices(
        updatedProfile.onlineClassBasePrice || 500000,
        updatedProfile.onlineClassDurations
      )
      const weeklySummary = extractWeeklyScheduleSummary(updatedProfile.weeklySchedule)
      console.log(
        `[TeacherOnlineClassSettings] saved user=${userId} basePrice=${updatedProfile.onlineClassBasePrice} level=${updatedProfile.educationLevel} subjects=${(updatedProfile.teachingSubjects || []).length} enabledDays=${weeklySummary.enabledDaysCount} slots=${weeklySummary.totalSlotsCount}`
      )

      return res.json({
        success: true,
        message: 'تنظیمات برنامه هفتگی و کلاس آنلاین با موفقیت ذخیره شد.',
        data: {
          basePrice90Min: updatedProfile.onlineClassBasePrice,
          durations: durationTable,
          weeklySchedule: weeklySummary.schedule,
          enabledDaysCount: weeklySummary.enabledDaysCount,
          totalSlotsCount: weeklySummary.totalSlotsCount,
        },
      })
    } catch (error: any) {
      console.error('Error updating online class settings:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * GET /api/teacher/center/class-requests
   * List both student booking requests and teacher-created virtual classes
   */
  static async getClassRequests(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { tab } = req.query // 'pending' | 'upcoming' | 'history' | 'all'

      const query: any = {
        $or: [{ teacherId: userId }, { targetTeacherIds: userId }],
      }

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
        .lean()

      const bookingIds = bookings.map((b: any) => b._id)
      const memberships = await OnlineClassMembership.find({ bookingId: { $in: bookingIds } })
        .populate('studentId', 'fullName avatar phoneNumber')
        .lean()

      const membershipsByBooking = new Map<string, any[]>()
      for (const m of memberships) {
        const key = m.bookingId.toString()
        const arr = membershipsByBooking.get(key) || []
        arr.push(m)
        membershipsByBooking.set(key, arr)
      }

      const enriched = bookings.map((b: any) => {
        const members = membershipsByBooking.get(b._id.toString()) || []
        return {
          ...b,
          source: b.source || 'booking',
          members,
          activeMembersCount: members.filter((m) => m.status === 'active' || m.status === 'accepted').length,
          pendingInvitesCount: members.filter((m) => m.status === 'pending_invite').length,
        }
      })

      return res.json({ success: true, data: enriched })
    } catch (error: any) {
      console.error('Error fetching teacher class requests:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/teacher/center/class-requests/:id/accept
   * Accept an online class booking request atomically with slot conflict check
   */
  static async acceptRequest(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params

      const outcome = await withTeacherBookingLock(userId.toString(), async () => {
        const booking = await OnlineClassBooking.findOne({
          _id: id,
          $or: [{ teacherId: userId }, { targetTeacherIds: userId }],
          status: 'paid_pending_teacher',
        })

        if (!booking) {
          return {
            statusCode: 404,
            success: false,
            message: 'درخواست کلاسی در انتظار پذیرش یافت نشد یا قبلاً تعیین تکلیف شده است.',
          }
        }

        const conflict = await OnlineClassBooking.findOne({
          _id: { $ne: booking._id },
          teacherId: userId,
          status: { $in: ['confirmed', 'in_progress'] },
          scheduledAt: { $lt: booking.endTime },
          endTime: { $gt: booking.scheduledAt },
        })

        if (conflict) {
          return {
            statusCode: 409,
            success: false,
            message: 'شما کلاس تاییدشده دیگری در این بازه زمانی دارید. امکان تایید همزمان وجود ندارد.',
          }
        }

        booking.teacherId = userId
        if (!booking.meeting?.meetingLink) {
          booking.meeting = OnlineClassService.generateMeetingInfo(booking.bookingCode)
        }
        booking.status = 'confirmed'
        await booking.save()

        // ارسال نوتیفیکیشن تایید کلاس به دانش‌آموز
        try {
          const teacherName = (req as any).user?.fullName || 'دبیر محترم'
          NotificationService.send({
            recipientType: 'student',
            recipientUserId: booking.studentId?.toString(),
            senderId: userId.toString(),
            senderName: teacherName,
            senderRole: 'teacher',
            title: 'کلاس آنلاین شما تایید شد! ✅',
            body: `${teacherName} درخواست کلاس «${booking.title || booking.subjectName}» را تایید کرد. کلاس در ساعت مقرر برگزار خواهد شد.`,
            type: 'ONLINE_CLASS',
            priority: 'high',
            targetId: booking._id.toString(),
            data: {
              bookingId: booking._id.toString(),
              bookingCode: booking.bookingCode,
              action: 'teacher_accepted',
            },
          }).catch((err) => console.warn('Failed to send class acceptance notification:', err))

          // ارسال پیامک الگوی کاوه‌نگار به دانش‌آموز (Requestaccepted)
          const studentUser = await User.findById(booking.studentId).select('fullName phoneNumber').lean()
          const studentPhone = (studentUser as any)?.phoneNumber
          const studentName = (studentUser as any)?.fullName || 'دانش‌آموز'
          if (studentPhone) {
            SmsService.sendStudentRequestAccepted({
              mobile: studentPhone,
              studentName,
              classTime: booking.scheduledAt,
            }).catch((err) => console.warn('Failed to send class acceptance SMS to student:', err))
          }
        } catch (notifErr) {
          console.warn('Error queuing class acceptance notification/SMS:', notifErr)
        }

        return {
          statusCode: 200,
          success: true,
          message: 'کلاس با موفقیت تایید شد و لینک جلسه فعال گردید.',
          data: booking,
        }
      })

      return res.status(outcome.statusCode).json(outcome)
    } catch (error: any) {
      console.error('Error accepting class request:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/teacher/center/class-requests/:id/invite
   * Teacher invites a student by phone number to an existing booking / virtual class
   */
  static async inviteStudent(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params
      const { phoneNumber, fullName } = req.body || {}

      if (!phoneNumber || !String(phoneNumber).trim()) {
        return res.status(400).json({ success: false, message: 'شماره موبایل دانش‌آموز الزامی است.' })
      }

      const booking = await OnlineClassBooking.findOne({ _id: id, teacherId: userId })
      if (!booking) {
        return res.status(404).json({ success: false, message: 'کلاس مورد نظر یافت نشد.' })
      }

      if (!['confirmed', 'in_progress'].includes(booking.status)) {
        return res.status(400).json({ success: false, message: 'امکان دعوت دانش‌آموز فقط برای کلاس‌های فعال وجود دارد.' })
      }

      const cleanPhone = SmsService.normalizePhone(String(phoneNumber).trim())
      const invitedUser = await User.findOne({ phoneNumber: cleanPhone }).select('fullName phoneNumber')
      const resolvedName = fullName?.trim() || invitedUser?.fullName || 'دانش‌آموز دعوت‌شده'

      // Upsert OnlineClassMembership without duplicates
      const existingMember = await OnlineClassMembership.findOne({
        bookingId: booking._id,
        $or: [
          ...(invitedUser ? [{ studentId: invitedUser._id }] : []),
          { phoneNumber: cleanPhone },
        ],
      })

      if (existingMember && existingMember.status !== 'declined' && existingMember.status !== 'removed') {
        return res.status(400).json({ success: false, message: 'این دانش‌آموز قبلاً به این کلاس دعوت شده است.' })
      }

      if (existingMember) {
        existingMember.status = 'pending_invite'
        existingMember.studentId = invitedUser?._id || existingMember.studentId
        existingMember.fullName = resolvedName
        existingMember.joinedAt = new Date()
        await existingMember.save()
      } else {
        await OnlineClassMembership.create({
          bookingId: booking._id,
          studentId: invitedUser?._id,
          phoneNumber: cleanPhone,
          fullName: resolvedName,
          role: 'invited',
          source: 'teacher_invitation',
          status: 'pending_invite',
          joinedAt: new Date(),
        })
      }

      const alreadyInArr = booking.invitedStudents.some((s) => s.phoneNumber === cleanPhone)
      if (!alreadyInArr) {
        booking.invitedStudents.push({
          studentId: invitedUser?._id,
          phoneNumber: cleanPhone,
          fullName: resolvedName,
          status: 'invited',
          invitedAt: new Date(),
        })
        await booking.save()
      }

      // ارسال نوتیفیکیشن دعوت برای دانش‌آموز
      try {
        const teacherName = (req as any).user?.fullName || 'دبیر محترم'
        NotificationService.send({
          recipientType: 'student',
          recipientPhone: cleanPhone,
          recipientUserId: invitedUser?._id?.toString(),
          senderId: userId.toString(),
          senderName: teacherName,
          senderRole: 'teacher',
          title: 'دعوت به کلاس آنلاین 🎓',
          body: `${teacherName} شما را به کلاس آنلاین «${booking.title || booking.subjectName}» دعوت کرد.`,
          type: 'ONLINE_CLASS',
          priority: 'normal',
          targetId: booking._id.toString(),
          data: {
            bookingId: booking._id.toString(),
            bookingCode: booking.bookingCode,
            action: 'teacher_invitation',
          },
        }).catch((err) => console.warn('Failed to send teacher invite notification:', err))
      } catch (notifErr) {
        console.warn('Error queuing teacher invite notification:', notifErr)
      }

      return res.json({
        success: true,
        message: 'دانش‌آموز با موفقیت به کلاس دعوت شد و در فهرست کلاس‌های او نمایش داده می‌شود.',
        data: booking,
      })
    } catch (error: any) {
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

      // ارسال نوتیفیکیشن رد کلاس به دانش‌آموز
      try {
        const teacherName = (req as any).user?.fullName || 'دبیر محترم'
        NotificationService.send({
          recipientType: 'student',
          recipientUserId: booking.studentId?.toString(),
          senderId: userId.toString(),
          senderName: teacherName,
          senderRole: 'teacher',
          title: 'عدم پذیرش کلاس آنلاین ❌',
          body: `درخواست کلاس «${booking.title || booking.subjectName}» توسط دبیر تایید نشد و هزینه پرداختی به کیف پول شما برگشت داده شد.`,
          type: 'ONLINE_CLASS',
          priority: 'high',
          targetId: booking._id.toString(),
          data: {
            bookingId: booking._id.toString(),
            bookingCode: booking.bookingCode,
            action: 'teacher_rejected',
            reason: booking.rejectionReason,
          },
        }).catch((err) => console.warn('Failed to send rejection notification:', err))
      } catch (notifErr) {
        console.warn('Error queuing rejection notification:', notifErr)
      }

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

