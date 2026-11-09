import { Request, Response } from 'express'
import { Types } from 'mongoose'
import { OnlineClassBooking } from '../../../core/models/OnlineClassBooking.js'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { User } from '../../../core/models/User.js'
import { Course } from '../../../core/models/Course.js'
import { Grade } from '../../../core/models/Grade.js'
import { Book } from '../../../core/models/Book.js'
import { OnlineClassService } from '../../../core/services/onlineClass.service.js'
import { WalletService } from '../../../core/services/wallet.service.js'

export class StudentOnlineClassController {
  /**
   * GET /api/student/online-classes/academic-hierarchy
   * Returns active courses, grades, and books/subjects
   */
  static async getAcademicHierarchy(req: Request, res: Response) {
    try {
      const courses = await Course.find({ isActive: true }).sort({ order: 1 })
      const grades = await Grade.find({ isActive: true }).sort({ order: 1 })
      const books = await Book.find({ isActive: true }).sort({ order: 1 })

      const hierarchy = courses.map((course) => {
        const courseGrades = grades.filter(
          (g) => g.course && g.course.toString() === course._id.toString()
        )

        return {
          id: course._id,
          name: course.name,
          code: course.code,
          description: course.description,
          grades: courseGrades.map((grade) => {
            const gradeBooks = books.filter(
              (b) => b.grade && b.grade.toString() === grade._id.toString()
            )
            return {
              id: grade._id,
              name: grade.name,
              subjects: gradeBooks.map((book) => ({
                id: book._id,
                name: book.name,
                icon: book.icon || '📖',
              })),
            }
          }),
        }
      })

      return res.json({ success: true, data: hierarchy })
    } catch (error: any) {
      console.error('Error fetching academic hierarchy:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/student/online-classes/available-teachers
   * Filter and list teachers available for online class booking
   */
  static async getAvailableTeachers(req: Request, res: Response) {
    try {
      const {
        courseId,
        gradeId,
        subjectId,
        subjectName,
        scheduledAt,
        durationMinutes = 60,
      } = req.body

      const duration = Number(durationMinutes) || 60
      const startTime = scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 3600000)
      const endTime = new Date(startTime.getTime() + duration * 60000)

      // Query active teacher profiles
      const profileQuery: any = {
        isActive: true,
      }

      const profiles = await TeacherProfile.find(profileQuery)
        .populate('user', 'fullName avatar phoneNumber')
        .sort({ rating: -1, ratingsCount: -1 })

      // Filter teachers who have enabled this duration
      const durationKey = duration.toString()
      const eligibleProfiles = profiles.filter((p: any) => {
        if (!p.user) return false
        if (p.onlineClassDurations) {
          if (p.onlineClassDurations instanceof Map) {
            return p.onlineClassDurations.get(durationKey) !== false
          }
          if (typeof p.onlineClassDurations === 'object') {
            return p.onlineClassDurations[durationKey] !== false
          }
        }
        return true
      })

      const teacherUserIds = eligibleProfiles.map((p) => p.user._id)

      // Find conflicting busy bookings
      const busyBookings = await OnlineClassBooking.find({
        teacherId: { $in: teacherUserIds },
        status: { $in: ['paid_pending_teacher', 'confirmed', 'in_progress'] },
        scheduledAt: { $lt: endTime },
        endTime: { $gt: startTime },
      }).select('teacherId')

      const busyTeacherIdSet = new Set(busyBookings.map((b) => b.teacherId.toString()))

      // Format available teachers
      const availableTeachers = eligibleProfiles
        .filter((p) => !busyTeacherIdSet.has(p.user._id.toString()))
        .map((p: any) => {
          const basePrice = p.onlineClassBasePrice || 500000
          const calculatedPrice = OnlineClassService.calculatePrice(basePrice, duration)

          return {
            id: p.user._id,
            profileId: p._id,
            fullName: p.user.fullName || 'استاد محترم',
            avatar: p.avatar || p.user.avatar || '',
            headline: p.headline || p.category || 'مدرس آنلاین',
            bio: p.bio || '',
            rating: p.rating || 5.0,
            ratingsCount: p.ratingsCount || 0,
            experienceYears: p.experienceYears || 0,
            basePrice90Min: basePrice,
            calculatedPrice,
            durationMinutes: duration,
            availabilityStatus: p.availabilityStatus || 'online',
          }
        })

      return res.json({ success: true, data: availableTeachers })
    } catch (error: any) {
      console.error('Error fetching available teachers for booking:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/student/online-classes/quote
   * Calculate transparent price breakdown
   */
  static async calculateQuote(req: Request, res: Response) {
    try {
      const { teacherId, durationMinutes = 60, capacity = 1 } = req.body

      const profile = await TeacherProfile.findOne({
        $or: [{ user: teacherId }, { _id: Types.ObjectId.isValid(teacherId) ? teacherId : null }],
      })

      const basePrice90Min = profile?.onlineClassBasePrice || 500000

      const quote = OnlineClassService.calculateQuote({
        basePrice90Min,
        durationMinutes: Number(durationMinutes) || 60,
        capacity: Number(capacity) || 1,
      })

      return res.json({ success: true, data: quote })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/student/online-classes/book
   * Book an online class session with mock payment
   */
  static async createBooking(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const {
        teacherId,
        courseId,
        courseName,
        gradeId,
        gradeName,
        subjectId,
        subjectName,
        topic,
        description,
        scheduledAt,
        durationMinutes,
        capacity = 1,
        isMockPayment = true,
      } = req.body

      if (!teacherId || !subjectName || !topic || !scheduledAt || !durationMinutes) {
        return res.status(400).json({
          success: false,
          message: 'انتخاب معلم، درس، موضوع، تاریخ و مدت کلاس الزامی است.',
        })
      }

      const duration = Number(durationMinutes)
      if (![15, 30, 45, 60, 75, 90].includes(duration)) {
        return res.status(400).json({ success: false, message: 'مدت کلاس نامعتبر است.' })
      }

      const startTime = new Date(scheduledAt)
      if (isNaN(startTime.getTime()) || startTime.getTime() < Date.now() - 60000) {
        return res.status(400).json({
          success: false,
          message: 'زمان شروع کلاس باید در آینده باشد.',
        })
      }

      const endTime = new Date(startTime.getTime() + duration * 60000)

      // Fetch teacher profile
      const teacherProfile = await TeacherProfile.findOne({
        $or: [{ user: teacherId }, { _id: Types.ObjectId.isValid(teacherId) ? teacherId : null }],
      }).populate('user', 'fullName avatar phoneNumber')

      if (!teacherProfile || !teacherProfile.user) {
        return res.status(404).json({ success: false, message: 'پروفایل معلم یافت نشد.' })
      }

      const teacherUserId = (teacherProfile.user as any)._id

      // Check conflict
      const conflict = await OnlineClassBooking.findOne({
        teacherId: teacherUserId,
        status: { $in: ['paid_pending_teacher', 'confirmed', 'in_progress'] },
        scheduledAt: { $lt: endTime },
        endTime: { $gt: startTime },
      })

      if (conflict) {
        return res.status(409).json({
          success: false,
          message: 'استاد محترم در این بازه زمانی کلاس رزرو شده دیگری دارند. لطفاً زمان دیگری را انتخاب کنید.',
        })
      }

      // Calculate quote
      const basePrice90Min = teacherProfile.onlineClassBasePrice || 500000
      const quote = OnlineClassService.calculateQuote({
        basePrice90Min,
        durationMinutes: duration,
        capacity: Number(capacity) || 1,
      })

      // Generate unique booking code
      const bookingCode = `CLS-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`
      const meetingInfo = OnlineClassService.generateMeetingInfo(bookingCode)

      let tx: any = null
      let paymentStatus: any = {
        isPaid: false,
        paymentMethod: 'mock_sandbox',
        trackingCode: '',
      }

      let bookingStatus: any = 'pending_payment'

      // In development / sandbox mode, process payment automatically
      if (isMockPayment) {
        paymentStatus = {
          isPaid: true,
          paidAt: new Date(),
          paymentMethod: 'mock_sandbox',
          trackingCode: `PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        }
        bookingStatus = 'paid_pending_teacher'
      }

      const booking = await OnlineClassBooking.create({
        bookingCode,
        studentId,
        teacherId: teacherUserId,
        courseId: courseId || undefined,
        courseName: courseName || '',
        gradeId: gradeId || undefined,
        gradeName: gradeName || '',
        subjectId: subjectId || undefined,
        subjectName,
        topic: topic.trim(),
        description: description ? description.trim() : '',
        scheduledAt: startTime,
        durationMinutes: duration,
        endTime,
        capacity: quote.capacity,
        pricing: quote,
        status: bookingStatus,
        payment: paymentStatus,
        meeting: meetingInfo,
      })

      return res.json({
        success: true,
        message: 'درخواست کلاس آنلاین با موفقیت ثبت شد و برای معلم ارسال گردید.',
        data: booking,
      })
    } catch (error: any) {
      console.error('Error creating class booking:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطا در ثبت رزرو' })
    }
  }

  /**
   * GET /api/student/online-classes/my-bookings
   */
  static async getMyBookings(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id

      const bookings = await OnlineClassBooking.find({
        $or: [{ studentId }, { 'invitedStudents.studentId': studentId }],
      })
        .populate('teacherId', 'fullName avatar phoneNumber')
        .populate('studentId', 'fullName avatar phoneNumber')
        .sort({ scheduledAt: -1 })

      return res.json({ success: true, data: bookings })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * GET /api/student/online-classes/bookings/:id
   */
  static async getBookingDetails(req: Request, res: Response) {
    try {
      const { id } = req.params
      const studentId = (req as any).user?._id

      const booking = await OnlineClassBooking.findById(id)
        .populate('teacherId', 'fullName avatar phoneNumber')
        .populate('studentId', 'fullName avatar phoneNumber')
        .populate('invitedStudents.studentId', 'fullName avatar phoneNumber')

      if (!booking) {
        return res.status(404).json({ success: false, message: 'رزرو کلاس یافت نشد.' })
      }

      return res.json({ success: true, data: booking })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/student/online-classes/bookings/:id/invite
   * Invite another student to this booking up to the paid capacity
   */
  static async inviteFriend(req: Request, res: Response) {
    try {
      const { id } = req.params
      const currentUserId = (req as any).user?._id
      const { phoneNumber, fullName } = req.body

      if (!phoneNumber || !phoneNumber.trim()) {
        return res.status(400).json({ success: false, message: 'شماره همراه دوست خود را وارد کنید.' })
      }

      const booking = await OnlineClassBooking.findById(id)
      if (!booking) {
        return res.status(404).json({ success: false, message: 'رزرو کلاس یافت نشد.' })
      }

      if (booking.studentId.toString() !== currentUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'تنها رزروکننده اصلی کلاس امکان دعوت دوستان را دارد.',
        })
      }

      // Check max capacity
      const currentParticipants = 1 + booking.invitedStudents.length
      if (currentParticipants >= booking.capacity) {
        return res.status(400).json({
          success: false,
          message: `ظرفیت پرداخت‌شده این کلاس تکمیل است (حداکثر ${booking.capacity} نفر).`,
        })
      }

      const cleanPhone = phoneNumber.trim()

      // Check if already invited
      const alreadyInvited = booking.invitedStudents.some(
        (inv) => inv.phoneNumber === cleanPhone
      )
      if (alreadyInvited) {
        return res.status(400).json({ success: false, message: 'این شماره قبلاً دعوت شده است.' })
      }

      // Check if user exists in database
      const invitedUser = await User.findOne({ phoneNumber: cleanPhone })

      booking.invitedStudents.push({
        studentId: invitedUser?._id,
        phoneNumber: cleanPhone,
        fullName: fullName?.trim() || invitedUser?.fullName || 'دانش‌آموز مهمان',
        status: invitedUser ? 'accepted' : 'invited',
        invitedAt: new Date(),
        acceptedAt: invitedUser ? new Date() : undefined,
      })

      await booking.save()

      return res.json({
        success: true,
        message: 'دعوت‌نامه با موفقیت برای دوست شما ثبت شد.',
        data: booking,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/student/online-classes/bookings/:id/cancel
   */
  static async cancelBooking(req: Request, res: Response) {
    try {
      const { id } = req.params
      const studentId = (req as any).user?._id
      const { reason } = req.body

      const booking = await OnlineClassBooking.findOne({ _id: id, studentId })
      if (!booking) {
        return res.status(404).json({ success: false, message: 'رزرو کلاس یافت نشد.' })
      }

      if (['completed', 'cancelled', 'rejected'].includes(booking.status)) {
        return res.status(400).json({
          success: false,
          message: 'این کلاس در وضعیتی نیست که امکان لغو آن وجود داشته باشد.',
        })
      }

      booking.status = 'cancelled'
      booking.cancellationReason = reason || 'لغو توسط دانش‌آموز'

      // Mock refund
      if (booking.payment?.isPaid) {
        booking.status = 'refunded'
      }

      await booking.save()

      return res.json({
        success: true,
        message: 'رزرو کلاس با موفقیت لغو شد و وجه آزمایشی آزاد گردید.',
        data: booking,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }
}

