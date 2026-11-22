import mongoose, { Types } from 'mongoose'
import { OnlineClassBooking, IOnlineClassBooking } from '../models/OnlineClassBooking.js'
import { ClassroomPricing, DEFAULT_CLASSROOM_POLICY, IOnlineClassSessionPolicy } from '../models/ClassroomPricing.js'
import { TeacherProfile } from '../models/TeacherProfile.js'
import { WalletService } from './wallet.service.js'
import { NotificationService } from './notificationService.js'
import { ClassroomSession } from '../../modules/classroom/models/ClassroomSession.js'
import { logger } from '../utils/logger.js'

export const DURATION_RATIOS: Record<number, number> = {
  90: 1.0,
  75: 0.88,
  60: 0.74,
  45: 0.58,
  30: 0.42,
  15: 0.24,
}

export const EXTRA_CAPACITY_PRICE_PER_STUDENT = 80000 // 80,000 Tomans per added student for student private class
export const TEACHER_RESERVATION_BASE_FEE = 80000 // 80,000 Tomans base fee for teacher 1.5h class
export const TEACHER_RESERVATION_PER_STUDENT_FEE = 50000 // 50,000 Tomans per added student for teacher
export const VIRTUAL_CLASSROOM_PER_STUDENT_FEE = 50000 // 50,000 Tomans per student for virtual classroom creation
export const STUDENT_SERVICE_FEE_PERCENT = 0 // transparent total as per prompt
export const TEACHER_SERVICE_FEE_PERCENT = 0.1 // 10% platform fee

export interface DurationPriceInfo {
  minutes: number
  price: number
  perMinutePrice: number
  label: string
  enabled: boolean
}

export class OnlineClassService {
  /**
   * Calculate price for a given duration based on 90-minute base price
   */
  static calculatePrice(basePrice90Min: number, durationMinutes: number): number {
    const ratio = DURATION_RATIOS[durationMinutes] ?? 1.0
    // Round to nearest 1,000 Tomans
    return Math.round((basePrice90Min * ratio) / 1000) * 1000
  }

  /**
   * Get all 6 calculated duration prices
   */
  static getDurationPrices(
    basePrice90Min: number,
    enabledMap?: Record<string, boolean> | Map<string, boolean>
  ): DurationPriceInfo[] {
    const durations = [90, 75, 60, 45, 30, 15]

    return durations.map((minutes) => {
      let isEnabled = true
      if (enabledMap) {
        if (enabledMap instanceof Map) {
          isEnabled = enabledMap.get(minutes.toString()) ?? true
        } else {
          isEnabled = enabledMap[minutes.toString()] ?? true
        }
      }

      const price = this.calculatePrice(basePrice90Min, minutes)
      return {
        minutes,
        price,
        perMinutePrice: Math.round(price / minutes),
        label: `${minutes} دقیقه`,
        enabled: isEnabled,
      }
    })
  }

  /**
   * Full quote calculation verified by server
   */
  static calculateQuote(params: {
    basePrice90Min: number
    durationMinutes: number
    capacity: number
  }) {
    const { basePrice90Min, durationMinutes, capacity } = params

    const validCapacity = Math.max(1, Math.min(10, Number(capacity) || 1))
    const baseClassPrice = this.calculatePrice(basePrice90Min, durationMinutes)
    const extraCapacityCount = Math.max(0, validCapacity - 1)
    const extraCapacityFee = extraCapacityCount * EXTRA_CAPACITY_PRICE_PER_STUDENT

    const subtotal = baseClassPrice + extraCapacityFee
    const studentServiceFee = Math.round(subtotal * STUDENT_SERVICE_FEE_PERCENT)
    const totalPrice = subtotal + studentServiceFee
    const perStudentShare = Math.round(totalPrice / validCapacity)

    // Teacher settlement logic:
    // Base class teacher fee is 10%. Extra capacity platform fee is 20% (teacher gets 80%).
    const teacherBaseFee = Math.round(baseClassPrice * TEACHER_SERVICE_FEE_PERCENT)
    const teacherExtraFee = Math.round(extraCapacityFee * 0.2)
    const teacherServiceFee = teacherBaseFee + teacherExtraFee
    const teacherEarnings = subtotal - teacherServiceFee

    return {
      baseClassPrice,
      extraCapacityCount,
      extraCapacityFee,
      subtotal,
      studentServiceFee,
      totalPrice,
      perStudentShare,
      teacherEarnings,
      teacherServiceFee,
      capacity: validCapacity,
    }
  }

  /**
   * Calculate fee for teacher reserving their own 1.5-hour class:
   * 80,000 Tomans base + 50,000 Tomans per added student
   */
  static calculateTeacherReservationFee(studentCount: number = 1): number {
    const extraStudents = Math.max(0, studentCount - 1)
    return TEACHER_RESERVATION_BASE_FEE + extraStudents * TEACHER_RESERVATION_PER_STUDENT_FEE
  }

  /**
   * Calculate fee for creating a virtual classroom:
   * 50,000 Tomans per student
   */
  static calculateVirtualClassroomFee(studentCount: number): number {
    return Math.max(1, studentCount) * VIRTUAL_CLASSROOM_PER_STUDENT_FEE
  }

  /**
   * Generate secure meeting link for self-hosted in-app online classroom
   */
  static generateMeetingInfo(bookingCode: string) {
    const cleanCode = bookingCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    const roomName = `kitayar-class-${cleanCode}`
    const meetingLink = `/classroom/${cleanCode}`
    return {
      platform: 'in_app' as const,
      meetingLink,
      roomName,
    }
  }

  /**
   * Get active session policy from DB or fallback to defaults
   */
  static async getSessionPolicy(): Promise<IOnlineClassSessionPolicy> {
    if (mongoose.connection.readyState !== 1) {
      return { ...DEFAULT_CLASSROOM_POLICY }
    }
    try {
      const pricingQuery: any = ClassroomPricing.findOne({ key: 'default' })
      const pricing = typeof pricingQuery?.lean === 'function' ? await pricingQuery.lean() : await pricingQuery
      const raw = (pricing as any)?.sessionPolicy
      if (!raw) return { ...DEFAULT_CLASSROOM_POLICY }
      return {
        unlockBeforeMinutes: raw?.unlockBeforeMinutes ?? DEFAULT_CLASSROOM_POLICY.unlockBeforeMinutes,
        teacherGraceMinutes: raw?.teacherGraceMinutes ?? DEFAULT_CLASSROOM_POLICY.teacherGraceMinutes,
        extraMinutes: raw?.extraMinutes ?? DEFAULT_CLASSROOM_POLICY.extraMinutes,
        endWarningMinutes: raw?.endWarningMinutes ?? DEFAULT_CLASSROOM_POLICY.endWarningMinutes,
        chatOpenHoursAfterEnd: raw?.chatOpenHoursAfterEnd ?? DEFAULT_CLASSROOM_POLICY.chatOpenHoursAfterEnd,
        teacherRules:
          Array.isArray(raw?.teacherRules) && raw.teacherRules.length > 0
            ? raw.teacherRules
            : [...DEFAULT_CLASSROOM_POLICY.teacherRules],
        studentRules:
          Array.isArray(raw?.studentRules) && raw.studentRules.length > 0
            ? raw.studentRules
            : [...DEFAULT_CLASSROOM_POLICY.studentRules],
      }
    } catch (err) {
      return { ...DEFAULT_CLASSROOM_POLICY }
    }
  }

  /**
   * Calculate effective class start and end time with teacher presence and buffer minutes:
   * - If teacher joins early (e.g. 16:56 when scheduled at 17:00), class clock starts strictly at 17:00.
   * - If teacher joins late (e.g. 17:15), class clock starts at 17:15.
   * - Extra buffer minutes (default 5) are added for internet issues.
   */
  static calculateClassEndTime(
    scheduledAt: Date,
    teacherJoinedAt: Date,
    durationMinutes: number,
    extraMinutes: number = 5
  ): { effectiveStartAt: Date; endsAt: Date } {
    const scheduledMs = new Date(scheduledAt).getTime()
    const joinedMs = new Date(teacherJoinedAt).getTime()
    const totalMinutes = Math.max(1, durationMinutes) + Math.max(0, extraMinutes)

    const effectiveStartAt = joinedMs < scheduledMs ? new Date(scheduledMs) : new Date(joinedMs)
    const endsAt = new Date(effectiveStartAt.getTime() + totalMinutes * 60 * 1000)

    return { effectiveStartAt, endsAt }
  }

  /**
   * Handle teacher absence after the grace period (> 30 mins after scheduled start):
   * 1. Cancels the booking with reason "عدم حضور معلم"
   * 2. Automatically refunds 100% of the payment to the student's wallet
   * 3. Sets teacherNoShow flag and increments teacher's noShowCount
   * 4. Cancels associated classroom session and dispatches notifications
   */
  static async handleTeacherNoShow(bookingOrId: string | Types.ObjectId | IOnlineClassBooking) {
    let booking: IOnlineClassBooking | null = null
    if (typeof bookingOrId === 'string' || bookingOrId instanceof Types.ObjectId) {
      if (mongoose.connection.readyState !== 1) return null
      booking = await OnlineClassBooking.findById(bookingOrId)
    } else {
      booking = bookingOrId
    }

    if (!booking) return null

    // Only process if teacher has not joined and booking is in actionable status
    if (
      booking.teacherJoinedAt ||
      ['completed', 'cancelled', 'refunded', 'rejected'].includes(booking.status)
    ) {
      return booking
    }

    booking.teacherNoShow = true
    booking.teacherNoShowAt = new Date()
    booking.cancellationReason = 'عدم حضور معلم'

    // Process automatic wallet refund for student if paid
    const isPaid = booking.payment?.isPaid
    const refundAmount = Number(booking.pricing?.totalPrice) || 0

    if (isPaid && refundAmount > 0 && booking.studentId) {
      try {
        await WalletService.credit({
          userId: booking.studentId,
          userType: 'student',
          amount: refundAmount,
          type: 'class_refund',
          description: `استرداد وجه به دلیل عدم حضور معلم در کلاس آنلاین «${booking.courseName || booking.topic || booking.subjectName}»`,
          referenceId: booking._id.toString(),
          referenceModel: 'OnlineClassBooking',
          idempotencyKey: `noshow_refund_${booking._id.toString()}`,
        })
        booking.status = 'refunded'
      } catch (refundErr) {
        logger.error('[OnlineClassService] Wallet refund failed for no-show booking:', refundErr)
        booking.status = 'cancelled'
      }
    } else {
      booking.status = 'cancelled'
    }

    await booking.save()

    // Increment TeacherProfile noShowCount penalty
    if (booking.teacherId) {
      try {
        await TeacherProfile.findOneAndUpdate(
          { user: booking.teacherId },
          { $inc: { noShowCount: 1 } }
        )
      } catch (tpErr) {
        logger.warn('[OnlineClassService] Error incrementing teacher noShowCount:', tpErr)
      }
    }

    // Cancel any associated active ClassroomSession
    try {
      await ClassroomSession.updateMany(
        { $or: [{ bookingId: booking._id }, { bookingCode: booking.bookingCode }] },
        { $set: { status: 'cancelled' } }
      )
    } catch (csErr) {
      logger.warn('[OnlineClassService] Error cancelling classroom session for no-show:', csErr)
    }

    // Dispatch SMS / Notification to Student and Teacher
    try {
      if (booking.studentId) {
        NotificationService.send({
          recipientType: 'student',
          recipientUserId: booking.studentId.toString(),
          title: 'استرداد وجه کلاس آنلاین',
          body: `کلاس «${booking.topic}» به دلیل عدم حضور دبیر لغو شد و مبلغ ${refundAmount.toLocaleString('fa-IR')} تومان به کیف پول شما مسترد گردید.`,
          type: 'ONLINE_CLASS',
          priority: 'high',
          targetId: booking._id.toString(),
        }).catch(() => {})
      }
      if (booking.teacherId) {
        NotificationService.send({
          recipientType: 'teacher',
          recipientUserId: booking.teacherId.toString(),
          title: 'ثبت عدم حضور در کلاس آنلاین',
          body: `به دلیل عدم حضور در کلاس آنلاین «${booking.topic}»، کلاس لغو و یک مورد عدم حضور در سوابق تدریس شما ثبت گردید.`,
          type: 'ONLINE_CLASS',
          priority: 'high',
          targetId: booking._id.toString(),
        }).catch(() => {})
      }
    } catch (notifErr) {
      logger.warn('[OnlineClassService] Notification dispatch error for no-show:', notifErr)
    }

    logger.info(`[OnlineClassService] Auto-cancelled no-show booking ${booking.bookingCode} for teacher ${booking.teacherId}`)
    return booking
  }

  /**
   * Periodic scanner for overdue unjoined classes
   */
  static async auditNoShows(): Promise<number> {
    if (mongoose.connection.readyState !== 1) return 0
    try {
      const policy = await this.getSessionPolicy()
      const graceMs = (policy.teacherGraceMinutes ?? 30) * 60 * 1000
      const thresholdDate = new Date(Date.now() - graceMs)

      const overdueBookings = await OnlineClassBooking.find({
        status: { $in: ['confirmed', 'paid_pending_teacher', 'in_progress'] },
        teacherJoinedAt: { $exists: false },
        scheduledAt: { $lte: thresholdDate },
        teacherNoShow: { $ne: true },
      })

      for (const booking of overdueBookings) {
        await this.handleTeacherNoShow(booking)
      }

      return overdueBookings.length
    } catch (err) {
      logger.error('[OnlineClassService] Error running auditNoShows:', err)
      return 0
    }
  }

  /**
   * Auto-expire paid_pending_teacher bookings whose 30-min teacher response window has passed.
   * Refunds student and notifies both parties.
   */
  static async auditExpiredPendingBookings(): Promise<number> {
    if (mongoose.connection.readyState !== 1) return 0
    try {
      const now = new Date()
      const expiredBookings = await OnlineClassBooking.find({
        status: 'paid_pending_teacher',
        waitingExpiresAt: { $lt: now },
      })

      for (const booking of expiredBookings) {
        try {
          booking.status = 'expired'
          booking.cancellationReason = 'انقضای زمان پاسخ معلم'

          const isPaid = booking.payment?.isPaid
          const refundAmount = Number(booking.pricing?.totalPrice) || 0

          if (isPaid && refundAmount > 0 && booking.studentId) {
            await WalletService.credit({
              userId: booking.studentId,
              userType: 'student',
              amount: refundAmount,
              type: 'class_refund',
              description: `استرداد وجه به دلیل عدم پاسخ معلم در مهلت مقرر: «${booking.topic || booking.subjectName}»`,
              referenceId: booking._id.toString(),
              referenceModel: 'OnlineClassBooking',
              idempotencyKey: `pending_expire_refund_${booking._id.toString()}`,
            })
            booking.status = 'refunded'
          }

          await booking.save()

          // Notify student
          if (booking.studentId) {
            NotificationService.send({
              recipientType: 'student',
              recipientUserId: booking.studentId.toString(),
              title: 'درخواست کلاس منقضی شد',
              body: `درخواست کلاس «${booking.topic || booking.subjectName}» به دلیل عدم پاسخ معلم در ۳۰ دقیقه لغو و وجه به کیف پول شما برگشت داده شد.`,
              type: 'ONLINE_CLASS',
              priority: 'high',
              targetId: booking._id.toString(),
            }).catch(() => {})
          }

          // Notify teacher
          if (booking.teacherId) {
            NotificationService.send({
              recipientType: 'teacher',
              recipientUserId: booking.teacherId.toString(),
              title: 'درخواست کلاس منقضی شد',
              body: `درخواست کلاس دانش‌آموز برای «${booking.topic || booking.subjectName}» به دلیل عدم پاسخ شما منقضی گردید.`,
              type: 'ONLINE_CLASS',
              priority: 'normal',
              targetId: booking._id.toString(),
            }).catch(() => {})
          }

          logger.info(`[OnlineClassService] Expired pending booking ${booking.bookingCode}`)
        } catch (bookingErr) {
          logger.error(`[OnlineClassService] Error expiring pending booking ${booking._id}:`, bookingErr)
        }
      }

      return expiredBookings.length
    } catch (err) {
      logger.error('[OnlineClassService] Error running auditExpiredPendingBookings:', err)
      return 0
    }
  }

  private static schedulerStarted = false
  static startNoShowAuditScheduler(): void {
    if (this.schedulerStarted) return
    this.schedulerStarted = true
    const timer = setInterval(() => {
      this.auditNoShows().catch((e) =>
        logger.error('[OnlineClassService] Periodic no-show audit error:', e)
      )
      this.auditExpiredPendingBookings().catch((e) =>
        logger.error('[OnlineClassService] Periodic pending-expiry audit error:', e)
      )
    }, 60 * 1000)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
  }
}

