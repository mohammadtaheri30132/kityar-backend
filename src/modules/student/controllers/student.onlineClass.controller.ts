import { Request, Response } from 'express'
import { Types } from 'mongoose'
import { OnlineClassBooking } from '../../../core/models/OnlineClassBooking.js'
import { OnlineClassMembership } from '../../../core/models/OnlineClassMembership.js'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { User } from '../../../core/models/User.js'
import { Course } from '../../../core/models/Course.js'
import { Grade } from '../../../core/models/Grade.js'
import { Book } from '../../../core/models/Book.js'
import {
  EduBook,
  EduChapter,
  EduField,
  EduGrade,
  EduLesson,
  EduLevel,
} from '../../../core/models/EduContent.js'
import { OnlineClassService } from '../../../core/services/onlineClass.service.js'
import { WalletService } from '../../../core/services/wallet.service.js'
import { SmsService } from '../../../core/services/sms.service.js'
import { NotificationService } from '../../../core/services/notificationService.js'
import { TeacherReview } from '../../../core/models/TeacherReview.js'
import { ClassroomSession } from '../../classroom/models/ClassroomSession.js'
import { RoomManager } from '../../classroom/native/services/RoomManager.js'
import { withTeacherBookingLock } from '../../../core/utils/bookingSlotLock.js'
import { logger } from '../../../core/utils/logger.js'
import {
  getTehranTimeParts,
  isWindowWithinWeeklySchedule,
  resolveRequestedDateTime,
  teacherMatchesAcademicCriteria,
  teacherMatchesEducationLevel,
} from '../../../core/utils/weeklySchedule.js'

export class StudentOnlineClassController {
  /**
   * GET /api/student/online-classes/academic-hierarchy
   * Reads rich curriculum from Educational Content Management (EduLevel -> EduGrade -> EduField -> EduBook -> EduChapter -> EduLesson),
   * falling back to legacy Course/Grade/Book if EduContent is empty.
   */
  static async getAcademicHierarchy(req: Request, res: Response) {
    try {
      const [eduLevels, eduGrades, eduFields, eduBooks, eduChapters, eduLessons] = await Promise.all([
        EduLevel.find({ isActive: true }).sort({ order: 1 }).lean(),
        EduGrade.find({ isActive: true }).sort({ order: 1 }).lean(),
        EduField.find({ isActive: true }).sort({ order: 1 }).lean(),
        EduBook.find({ isActive: true }).sort({ order: 1 }).lean(),
        EduChapter.find({ isActive: true }).sort({ order: 1 }).lean(),
        EduLesson.find({ isActive: true }).sort({ order: 1 }).lean(),
      ])

      if (eduLevels.length > 0) {
        const fieldNameMap = new Map<string, string>()
        for (const f of eduFields) fieldNameMap.set(String(f._id), f.name)

        const lessonsByChapter = new Map<string, any[]>()
        for (const l of eduLessons) {
          const cid = String(l.chapterId)
          if (!lessonsByChapter.has(cid)) lessonsByChapter.set(cid, [])
          lessonsByChapter.get(cid)!.push({ id: l._id, title: l.title })
        }

        const chaptersByBook = new Map<string, any[]>()
        for (const ch of eduChapters) {
          const bid = String(ch.bookId)
          if (!chaptersByBook.has(bid)) chaptersByBook.set(bid, [])
          chaptersByBook.get(bid)!.push({
            id: ch._id,
            title: ch.title,
            lessons: lessonsByChapter.get(String(ch._id)) || [],
          })
        }

        const booksByGrade = new Map<string, any[]>()
        for (const b of eduBooks) {
          const gid = String(b.gradeId)
          if (!booksByGrade.has(gid)) booksByGrade.set(gid, [])
          const fId = b.fieldId ? String(b.fieldId) : undefined
          booksByGrade.get(gid)!.push({
            id: b._id,
            name: b.title,
            fieldId: fId,
            fieldName: fId ? fieldNameMap.get(fId) : undefined,
            icon: '📘',
            chapters: chaptersByBook.get(String(b._id)) || [],
          })
        }

        const hierarchy = eduLevels.map((lvl) => {
          const levelFields = eduFields
            .filter((f) => String(f.levelId) === String(lvl._id))
            .map((f) => ({ id: f._id, name: f.name }))
          const levelGrades = eduGrades.filter((g) => String(g.levelId) === String(lvl._id))
          return {
            id: lvl._id,
            name: lvl.name,
            code: lvl.code,
            fields: levelFields,
            grades: levelGrades.map((g) => ({
              id: g._id,
              name: g.name,
              numericOrder: g.numericOrder,
              subjects: booksByGrade.get(String(g._id)) || [],
            })),
          }
        })

        return res.json({ success: true, data: hierarchy })
      }

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
                chapters: [],
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
   * Filter teachers strictly by:
   * 1) Active profile & supported duration
   * 2) Education level & teaching subjects
   * 3) Weekly availability schedule covering FULL requested [StartTime, EndTime]
   * 4) No overlapping confirmed / in_progress / paid_pending_teacher / active temporary holds
   */
  static async getAvailableTeachers(req: Request, res: Response) {
    try {
      const {
        courseId,
        courseName,
        gradeId,
        gradeName,
        subjectId,
        subjectName,
        scheduledAt,
        date,
        startTime: startTimeInput,
        durationMinutes = 60,
      } = req.body

      const duration = Number(durationMinutes) || 60
      if (![15, 30, 45, 60, 75, 90].includes(duration)) {
        return res.status(400).json({ success: false, message: 'مدت کلاس نامعتبر است.' })
      }

      const startTime = resolveRequestedDateTime({
        scheduledAt,
        date,
        startTime: startTimeInput,
      })

      if (!startTime) {
        return res.status(400).json({
          success: false,
          message: 'تاریخ و ساعت شروع کلاس معتبر نیست.',
        })
      }

      if (getTehranTimeParts(startTime).dateKey < getTehranTimeParts(new Date()).dateKey) {
        return res.status(400).json({
          success: false,
          message: 'امکان جستجو برای تاریخ‌های گذشته وجود ندارد.',
        })
      }

      const endTime = new Date(startTime.getTime() + duration * 60000)

      // Resolve course/grade/subject names if only IDs were sent
      let resolvedCourseName = courseName || ''
      let resolvedGradeName = gradeName || ''
      let resolvedSubjectName = subjectName || ''

      if (!resolvedCourseName && courseId && Types.ObjectId.isValid(courseId)) {
        const c = (await EduLevel.findById(courseId).select('name').lean()) || (await Course.findById(courseId).select('name').lean())
        if (c) resolvedCourseName = c.name
      }
      if (!resolvedGradeName && gradeId && Types.ObjectId.isValid(gradeId)) {
        const g = (await EduGrade.findById(gradeId).select('name').lean()) || (await Grade.findById(gradeId).select('name').lean())
        if (g) resolvedGradeName = g.name
      }
      if (!resolvedSubjectName && subjectId && Types.ObjectId.isValid(subjectId)) {
        const eb = await EduBook.findById(subjectId).select('title').lean()
        if (eb) {
          resolvedSubjectName = eb.title
        } else {
          const b = await Book.findById(subjectId).select('name').lean()
          if (b) resolvedSubjectName = b.name
        }
      }

      const profiles = await TeacherProfile.find({ isActive: { $ne: false } })
        .populate('user', 'fullName avatar phoneNumber')
        .sort({ rating: -1, ratingsCount: -1 })

      const durationKey = duration.toString()
      const eligibleWithWindow: Array<{
        profile: any
        windowInfo: ReturnType<typeof isWindowWithinWeeklySchedule>
        isSubjectMatch: boolean
      }> = []
      const skipDiagnostics: Array<{ teacherId: string; name?: string; reason: string }> = []

      for (const p of profiles as any[]) {
        if (!p.user) continue
        const tId = String(p.user._id || p.user)
        const tName = p.user.fullName || p.user.phoneNumber || tId

        // 1. Duration preference
        if (p.onlineClassDurations) {
          const allowed =
            p.onlineClassDurations instanceof Map
              ? p.onlineClassDurations.get(durationKey) !== false
              : p.onlineClassDurations[durationKey] !== false
          if (!allowed) {
            skipDiagnostics.push({ teacherId: tId, name: tName, reason: `duration_disabled:${durationKey}` })
            continue
          }
        }

        // 2. Education level match (both matches all courses; exact subject match prioritized below)
        if (!teacherMatchesEducationLevel(p, { courseName: resolvedCourseName })) {
          skipDiagnostics.push({
            teacherId: tId,
            name: tName,
            reason: `level_mismatch(level=${p.educationLevel},course=${resolvedCourseName})`,
          })
          continue
        }

        const isSubjectMatch = teacherMatchesAcademicCriteria(p, {
          subjectName: resolvedSubjectName,
          courseName: resolvedCourseName,
          gradeName: resolvedGradeName,
        })

        // 3. Weekly availability schedule check
        const windowInfo = isWindowWithinWeeklySchedule(p.weeklySchedule, startTime, duration, {
          flexibleSingleSlot: true,
        })
        if (!windowInfo.available) {
          skipDiagnostics.push({
            teacherId: tId,
            name: tName,
            reason: `schedule_miss(${windowInfo.weekday}:${windowInfo.startHHMM}-${windowInfo.endHHMM})`,
          })
          continue
        }

        eligibleWithWindow.push({ profile: p, windowInfo, isSubjectMatch })
      }

      eligibleWithWindow.sort((a, b) => Number(b.isSubjectMatch) - Number(a.isSubjectMatch))

      const teacherUserIds = eligibleWithWindow.map((item) => item.profile.user._id)
      const now = new Date()

      // 4. Find conflicting active bookings + unexpired temporary payment holds
      const busyBookings =
        teacherUserIds.length > 0
          ? await OnlineClassBooking.find({
              $or: [
                { teacherId: { $in: teacherUserIds } },
                { targetTeacherIds: { $in: teacherUserIds } },
              ],
              scheduledAt: { $lt: endTime },
              endTime: { $gt: startTime },
              $and: [
                {
                  $or: [
                    { status: { $in: ['paid_pending_teacher', 'confirmed', 'in_progress'] } },
                    { status: 'pending_payment', waitingExpiresAt: { $gt: now } },
                  ],
                },
              ],
            })
              .select('teacherId targetTeacherIds')
              .lean()
          : []

      const busyTeacherIdSet = new Set<string>()
      for (const b of busyBookings as any[]) {
        if (b.teacherId) busyTeacherIdSet.add(b.teacherId.toString())
        if (Array.isArray(b.targetTeacherIds)) {
          for (const tid of b.targetTeacherIds) {
            if (tid) busyTeacherIdSet.add(tid.toString())
          }
        }
      }

      const availableTeachers = eligibleWithWindow
        .filter(({ profile }) => !busyTeacherIdSet.has(profile.user._id.toString()))
        .map(({ profile: p, windowInfo }) => {
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
            teachingSubjects: p.teachingSubjects || [],
            educationLevel: p.educationLevel || 'both',
            basePrice90Min: basePrice,
            calculatedPrice,
            durationMinutes: duration,
            scheduledAt: startTime.toISOString(),
            endTime: endTime.toISOString(),
            startTimeTehran: windowInfo.startHHMM,
            endTimeTehran: windowInfo.endHHMM,
            weekday: windowInfo.weekday,
            canBook: true,
            availabilityStatus: p.availabilityStatus || 'online',
          }
        })

      logger.info(
        `[OnlineClassSearch] course="${resolvedCourseName}" grade="${resolvedGradeName}" subject="${resolvedSubjectName}" start="${startTime.toISOString()}" dur=${duration}m -> checked=${profiles.length}, matched=${availableTeachers.length}, skipped=${JSON.stringify(skipDiagnostics.slice(0, 10))}`
      )

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
   * Atomically validates weekly schedule + overlap lock, creates booking and requester OnlineClassMembership.
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
        date,
        startTime: startTimeInput,
        durationMinutes,
        capacity = 1,
        isMockPayment = true,
      } = req.body

      if (!teacherId || !subjectName || !topic || (!scheduledAt && !(date && startTimeInput)) || !durationMinutes) {
        return res.status(400).json({
          success: false,
          message: 'انتخاب معلم، درس، موضوع، تاریخ و مدت کلاس الزامی است.',
        })
      }

      const duration = Number(durationMinutes)
      if (![15, 30, 45, 60, 75, 90].includes(duration)) {
        return res.status(400).json({ success: false, message: 'مدت کلاس نامعتبر است.' })
      }

      const startTime = resolveRequestedDateTime({
        scheduledAt,
        date,
        startTime: startTimeInput,
      })
      if (!startTime || getTehranTimeParts(startTime).dateKey < getTehranTimeParts(new Date()).dateKey) {
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

      const lockResult = await withTeacherBookingLock(teacherUserId.toString(), async () => {
        // Re-fetch latest profile & validate weekly availability window inside lock
        const freshProfile = await TeacherProfile.findById(teacherProfile._id).lean()
        const windowCheck = isWindowWithinWeeklySchedule(freshProfile?.weeklySchedule, startTime, duration, {
          flexibleSingleSlot: true,
        })
        if (!windowCheck.available) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message:
                'زمان و مدت انتخابی در بازه کاری هفتگی استاد قرار ندارد. لطفاً زمان یا مدت دیگری را انتخاب کنید.',
            },
          }
        }

        const now = new Date()
        const conflict = await OnlineClassBooking.findOne({
          $or: [{ teacherId: teacherUserId }, { targetTeacherIds: teacherUserId }],
          scheduledAt: { $lt: endTime },
          endTime: { $gt: startTime },
          $and: [
            {
              $or: [
                { status: { $in: ['paid_pending_teacher', 'confirmed', 'in_progress'] } },
                { status: 'pending_payment', waitingExpiresAt: { $gt: now } },
              ],
            },
          ],
        })

        if (conflict) {
          return {
            statusCode: 409,
            body: {
              success: false,
              message:
                'استاد محترم در این بازه زمانی کلاس رزرو شده دیگری دارند. لطفاً زمان دیگری را انتخاب کنید.',
            },
          }
        }

        const basePrice90Min = freshProfile?.onlineClassBasePrice || teacherProfile.onlineClassBasePrice || 500000
        const quote = OnlineClassService.calculateQuote({
          basePrice90Min,
          durationMinutes: duration,
          capacity: Number(capacity) || 1,
        })

        const bookingCode = `CLS-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`
        const meetingInfo = OnlineClassService.generateMeetingInfo(bookingCode)

        let paymentStatus: any = {
          isPaid: false,
          paymentMethod: 'mock_sandbox',
          trackingCode: '',
        }
        let bookingStatus: any = 'pending_payment'
        let waitingExpiresAt: Date | undefined = new Date(Date.now() + 10 * 60 * 1000)

        if (isMockPayment) {
          paymentStatus = {
            isPaid: true,
            paidAt: new Date(),
            paymentMethod: 'mock_sandbox',
            trackingCode: `PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          }
          bookingStatus = 'paid_pending_teacher'
          waitingExpiresAt = undefined
        }

        const booking = await OnlineClassBooking.create({
          bookingCode,
          source: 'booking',
          title: topic.trim(),
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
          waitingExpiresAt,
          status: bookingStatus,
          payment: paymentStatus,
          meeting: meetingInfo,
        })

        const requesterUser = await User.findById(studentId).select('fullName phoneNumber').lean()
        await OnlineClassMembership.updateOne(
          { bookingId: booking._id, studentId },
          {
            $setOnInsert: {
              bookingId: booking._id,
              studentId,
              phoneNumber: (requesterUser as any)?.phoneNumber,
              fullName: (requesterUser as any)?.fullName || 'دانش‌آموز',
              role: 'requester',
              source: 'booking',
              status: 'active',
              joinedAt: new Date(),
            },
          },
          { upsert: true }
        )

        // ارسال فوری پوش نوتیفیکیشن و اعلان درون‌برنامه‌ای به دبیر
        try {
          const requesterName = (requesterUser as any)?.fullName || 'دانش‌آموز'
          NotificationService.send({
            recipientType: 'teacher',
            recipientUserId: teacherUserId.toString(),
            senderId: studentId.toString(),
            senderName: requesterName,
            senderRole: 'student',
            title: 'درخواست کلاس آنلاین جدید 📚',
            body: `${requesterName} برای مبحث «${topic.trim()}» درخواست کلاس آنلاین ثبت کرده است. برای پذیرش ۳۰ دقیقه فرصت دارید.`,
            type: 'ONLINE_CLASS',
            priority: 'high',
            targetId: booking._id.toString(),
            data: {
              bookingId: booking._id.toString(),
              bookingCode: booking.bookingCode,
              topic: topic.trim(),
              scheduledAt: startTime.toISOString(),
            },
          }).catch((err) => logger.warn('Failed to send class request notification to teacher:', err))
        } catch (notifErr) {
          logger.warn('Error queuing class booking notification:', notifErr)
        }

        return {
          statusCode: 200,
          body: {
            success: true,
            message: 'درخواست کلاس آنلاین با موفقیت ثبت شد و برای معلم ارسال گردید.',
            data: booking,
          },
        }
      })

      return res.status(lockResult.statusCode).json(lockResult.body)
    } catch (error: any) {
      console.error('Error creating class booking:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطا در ثبت رزرو' })
    }
  }

  private static async attachClassroomRecordingToBooking(bookingDoc: any) {
    const plain = typeof bookingDoc.toObject === 'function' ? bookingDoc.toObject() : { ...bookingDoc }
    try {
      const session = await ClassroomSession.findOne({
        $or: [
          { bookingId: plain._id },
          ...(plain.bookingCode ? [{ bookingCode: plain.bookingCode }] : []),
          ...(plain.meeting?.roomId ? [{ roomName: plain.meeting.roomId }] : []),
        ],
      }).lean()

      if (session) {
        const liveRoom = RoomManager.getRoom(session.roomName) || RoomManager.getCompletedRoom(session.roomName)
        const videoUrl = liveRoom?.recording?.videoUrl || session.recording?.videoUrl
        const serverLogsCount = liveRoom?.recording?.serverLogs?.length || session.recording?.serverLogs?.length || 0
        const chatLogsCount = liveRoom?.chatMessages?.length || session.recording?.chatLog?.length || 0
        const status =
          liveRoom?.recording?.status && liveRoom.recording.status !== 'idle'
            ? liveRoom.recording.status
            : session.recording?.status || 'idle'

        plain.classroomSessionId = session._id
        plain.classroomRoomName = session.roomName
        plain.classroomRecording = {
          hasRecording: Boolean(videoUrl || serverLogsCount > 0 || chatLogsCount > 0),
          roomId: session.roomName,
          status,
          videoUrl,
          durationSeconds: session.recording?.durationSeconds || session.durationSeconds || 0,
          expiresAt: session.recording?.expiresAt,
          serverLogsCount,
          chatLogsCount,
        }
      }
    } catch {}
    return plain
  }

  private static async buildUnifiedStudentBookingView(
    bookingDoc: any,
    studentIdStr: string,
    studentPhone: string | undefined,
    membershipByBookingId: Map<string, any>
  ) {
    const plain = await StudentOnlineClassController.attachClassroomRecordingToBooking(bookingDoc)
    const idStr = plain._id.toString()
    const membership = membershipByBookingId.get(idStr)

    const requesterIdStr =
      typeof plain.studentId === 'object' && plain.studentId?._id
        ? plain.studentId._id.toString()
        : plain.studentId?.toString()

    const isRequester = requesterIdStr === studentIdStr
    const source: 'booking' | 'teacher_invitation' = plain.source || 'booking'
    const myRole: 'requester' | 'invited' = membership?.role || (isRequester ? 'requester' : 'invited')

    let myMembershipStatus: string = membership?.status || ''
    if (!myMembershipStatus) {
      if (isRequester) {
        myMembershipStatus = 'active'
      } else {
        const inv = (plain.invitedStudents || []).find((s: any) => {
          const sid = typeof s.studentId === 'object' && s.studentId?._id ? s.studentId._id.toString() : s.studentId?.toString()
          return sid === studentIdStr || (studentPhone && s.phoneNumber === studentPhone)
        })
        if (inv) {
          myMembershipStatus =
            inv.status === 'accepted'
              ? 'accepted'
              : inv.status === 'declined'
                ? 'declined'
                : 'pending_invite'
        }
      }
    }

    const isClassJoinableStatus = ['confirmed', 'in_progress'].includes(plain.status)
    const isMembershipEligible = ['active', 'accepted'].includes(myMembershipStatus)

    return {
      ...plain,
      source,
      title: plain.title || plain.topic || plain.subjectName || 'کلاس آنلاین',
      myRole,
      myMembershipStatus: myMembershipStatus || 'active',
      canJoinLive: isClassJoinableStatus && isMembershipEligible,
      canRespondInvite:
        myRole === 'invited' &&
        (myMembershipStatus === 'pending_invite' || myMembershipStatus === 'invited') &&
        isClassJoinableStatus,
      canReplay: plain.status === 'completed' || Boolean(plain.classroomRecording?.hasRecording),
    }
  }

  /**
   * GET /api/student/online-classes/my-bookings
   * Unified list of ALL classes the student owns, requested, or was invited to (including teacher virtual classes).
   */
  static async getMyBookings(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const studentPhoneRaw = (req as any).user?.phoneNumber
      const studentPhone = studentPhoneRaw ? SmsService.normalizePhone(studentPhoneRaw) : undefined
      await RoomManager.cleanupExpiredRecordings()

      // Sync any pending phone-based memberships to this authenticated student user
      if (studentPhone) {
        await OnlineClassMembership.updateMany(
          { phoneNumber: studentPhone, studentId: { $exists: false } },
          { $set: { studentId } }
        ).catch(() => {})
      }

      const memberships = await OnlineClassMembership.find({
        $or: [
          { studentId },
          ...(studentPhone ? [{ phoneNumber: studentPhone }] : []),
        ],
        status: { $ne: 'removed' },
      }).lean()

      const membershipByBookingId = new Map<string, any>()
      const memberBookingIds: any[] = []
      for (const m of memberships) {
        membershipByBookingId.set(m.bookingId.toString(), m)
        memberBookingIds.push(m.bookingId)
      }

      const bookings = await OnlineClassBooking.find({
        $or: [
          { studentId },
          { 'invitedStudents.studentId': studentId },
          ...(studentPhone ? [{ 'invitedStudents.phoneNumber': studentPhone }] : []),
          ...(memberBookingIds.length > 0 ? [{ _id: { $in: memberBookingIds } }] : []),
        ],
      })
        .populate('teacherId', 'fullName avatar phoneNumber')
        .populate('studentId', 'fullName avatar phoneNumber')
        .populate('invitedStudents.studentId', 'fullName avatar phoneNumber')
        .sort({ scheduledAt: -1 })

      const enriched = await Promise.all(
        bookings.map((b) =>
          StudentOnlineClassController.buildUnifiedStudentBookingView(
            b,
            studentId.toString(),
            studentPhone,
            membershipByBookingId
          )
        )
      )

      return res.json({ success: true, data: enriched })
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
      const studentPhoneRaw = (req as any).user?.phoneNumber
      const studentPhone = studentPhoneRaw ? SmsService.normalizePhone(studentPhoneRaw) : undefined
      await RoomManager.cleanupExpiredRecordings()

      const booking = await OnlineClassBooking.findById(id)
        .populate('teacherId', 'fullName avatar phoneNumber')
        .populate('studentId', 'fullName avatar phoneNumber')
        .populate('invitedStudents.studentId', 'fullName avatar phoneNumber')

      if (!booking) {
        return res.status(404).json({ success: false, message: 'رزرو کلاس یافت نشد.' })
      }

      const membership = studentId
        ? await OnlineClassMembership.findOne({
            bookingId: booking._id,
            $or: [
              { studentId },
              ...(studentPhone ? [{ phoneNumber: studentPhone }] : []),
            ],
          }).lean()
        : null

      const membershipMap = new Map<string, any>()
      if (membership) {
        membershipMap.set(booking._id.toString(), membership)
      }

      const enriched = studentId
        ? await StudentOnlineClassController.buildUnifiedStudentBookingView(
            booking,
            studentId.toString(),
            studentPhone,
            membershipMap
          )
        : await StudentOnlineClassController.attachClassroomRecordingToBooking(booking)

      return res.json({ success: true, data: enriched })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/student/online-classes/bookings/:id/respond-invite
   * Accept or decline an invitation to a teacher-created virtual class or group booking.
   */
  static async respondToInvite(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { action } = req.body // 'accept' | 'decline'
      const studentId = (req as any).user?._id
      const studentPhoneRaw = (req as any).user?.phoneNumber
      const studentPhone = studentPhoneRaw ? SmsService.normalizePhone(studentPhoneRaw) : undefined
      const studentName = (req as any).user?.fullName || 'دانش‌آموز'

      if (!['accept', 'decline'].includes(action)) {
        return res.status(400).json({ success: false, message: 'عملیات نامعتبر است.' })
      }

      const booking = await OnlineClassBooking.findById(id)
      if (!booking) {
        return res.status(404).json({ success: false, message: 'کلاس مورد نظر یافت نشد.' })
      }

      const invEntry = (booking.invitedStudents || []).find((s) => {
        const sid = s.studentId?.toString()
        return sid === studentId.toString() || (studentPhone && s.phoneNumber === studentPhone)
      })

      const membership = await OnlineClassMembership.findOne({
        bookingId: booking._id,
        $or: [
          { studentId },
          ...(studentPhone ? [{ phoneNumber: studentPhone }] : []),
        ],
      })

      if (!invEntry && !membership) {
        return res.status(403).json({
          success: false,
          message: 'شما دعوت‌نامه‌ای برای این کلاس ندارید.',
        })
      }

      const nextMembershipStatus = action === 'accept' ? 'accepted' : 'declined'
      const nextInviteStatus = action === 'accept' ? 'accepted' : 'declined'

      if (membership) {
        membership.status = nextMembershipStatus
        membership.studentId = studentId
        membership.respondedAt = new Date()
        await membership.save()
      } else {
        await OnlineClassMembership.create({
          bookingId: booking._id,
          studentId,
          phoneNumber: studentPhone,
          fullName: studentName,
          role: 'invited',
          source: booking.source || 'teacher_invitation',
          status: nextMembershipStatus,
          joinedAt: new Date(),
          respondedAt: new Date(),
        })
      }

      if (invEntry) {
        invEntry.studentId = studentId
        invEntry.status = nextInviteStatus
        if (action === 'accept') invEntry.acceptedAt = new Date()
        await booking.save()
      }

      return res.json({
        success: true,
        message:
          action === 'accept'
            ? 'دعوت کلاس با موفقیت پذیرفته شد و دسترسی ورود برای شما فعال گردید.'
            : 'دعوت کلاس رد شد.',
        data: {
          bookingId: booking._id,
          membershipStatus: nextMembershipStatus,
        },
      })
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

      if (!booking.studentId || booking.studentId.toString() !== currentUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'تنها رزروکننده اصلی کلاس امکان دعوت دوستان را دارد.',
        })
      }

      if (!['paid_pending_teacher', 'confirmed', 'in_progress'].includes(booking.status)) {
        return res.status(400).json({
          success: false,
          message: 'امکان دعوت دوست فقط برای کلاس‌های فعال و پیش‌رو وجود دارد.',
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

      const cleanPhone = SmsService.normalizePhone(phoneNumber.trim())

      // Check if already invited
      const alreadyInvited = booking.invitedStudents.some(
        (inv) => inv.phoneNumber === cleanPhone
      )
      if (alreadyInvited) {
        return res.status(400).json({ success: false, message: 'این شماره قبلاً دعوت شده است.' })
      }

      // Check if user exists in database
      const invitedUser = await User.findOne({ phoneNumber: cleanPhone })
      const resolvedName = fullName?.trim() || invitedUser?.fullName || 'دانش‌آموز مهمان'

      booking.invitedStudents.push({
        studentId: invitedUser?._id,
        phoneNumber: cleanPhone,
        fullName: resolvedName,
        status: invitedUser ? 'accepted' : 'invited',
        invitedAt: new Date(),
        acceptedAt: invitedUser ? new Date() : undefined,
      })

      await booking.save()

      await OnlineClassMembership.updateOne(
        invitedUser
          ? { bookingId: booking._id, studentId: invitedUser._id }
          : { bookingId: booking._id, phoneNumber: cleanPhone },
        {
          $setOnInsert: {
            bookingId: booking._id,
            studentId: invitedUser?._id,
            phoneNumber: cleanPhone,
            fullName: resolvedName,
            role: 'invited',
            source: booking.source || 'booking',
            status: invitedUser ? 'accepted' : 'pending_invite',
            joinedAt: new Date(),
          },
        },
        { upsert: true }
      )

      // ارسال نوتیفیکیشن دعوت برای دوست
      try {
        const inviter = await User.findById(currentUserId).select('fullName')
        const inviterName = (inviter as any)?.fullName || 'دوست شما'
        NotificationService.send({
          recipientType: 'student',
          recipientPhone: cleanPhone,
          recipientUserId: invitedUser?._id,
          senderId: currentUserId.toString(),
          senderName: inviterName,
          senderRole: 'student',
          title: 'دعوت به کلاس آنلاین 🎓',
          body: `${inviterName} شما را به کلاس آنلاین «${booking.title || booking.subjectName}» دعوت کرد.`,
          type: 'ONLINE_CLASS',
          priority: 'normal',
          targetId: booking._id.toString(),
          data: {
            bookingId: booking._id.toString(),
            bookingCode: booking.bookingCode,
            action: 'friend_invitation',
          },
        }).catch((err) => logger.warn('Failed to send friend invite notification:', err))
      } catch (notifErr) {
        logger.warn('Error in friend invite notification:', notifErr)
      }

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

  /**
   * GET /api/student/online-classes/search-student
   * Search registered student in Nokita by phone number to confirm name before adding to class
   */
  static async searchStudentByPhone(req: Request, res: Response) {
    try {
      const { phone } = req.query
      if (!phone || typeof phone !== 'string') {
        return res.status(400).json({ success: false, message: 'شماره تلفن الزامی است' })
      }

      const cleanPhone = SmsService.normalizePhone(phone)
      const user = await User.findOne({ phoneNumber: cleanPhone }).select('fullName phoneNumber avatar')

      if (!user) {
        return res.json({
          success: true,
          exists: false,
          message: 'دانش‌آموزی با این شماره در نوکیتا یافت نشد.',
        })
      }

      return res.json({
        success: true,
        exists: true,
        user: {
          id: user._id,
          fullName: user.fullName || 'کاربر نوکیتا',
          phoneNumber: user.phoneNumber,
          avatar: user.avatar || '',
        },
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/student/online-classes/bookings/:id/review
   * Post-class survey: rating, audio voice feedback, complaint
   */
  static async submitBookingReview(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const { id } = req.params
      const { rating = 5, comment = '', voiceUrl, isComplaint = false, complaintText = '' } = req.body

      const booking = await OnlineClassBooking.findById(id)
      if (!booking) {
        return res.status(404).json({ success: false, message: 'کلاس یافت نشد' })
      }

      booking.review = {
        rating: Number(rating) || 5,
        comment: comment || '',
        voiceUrl: voiceUrl || undefined,
        isComplaint: Boolean(isComplaint),
        complaintText: complaintText || undefined,
        reviewedAt: new Date(),
      }
      await booking.save()

      // Also create TeacherReview record
      if (booking.teacherId) {
        await TeacherReview.create({
          teacherId: booking.teacherId,
          studentId,
          rating: Number(rating) || 5,
          comment: comment || (isComplaint ? complaintText : 'جلسه آنلاین برگزار شد.'),
          voiceUrl: voiceUrl || undefined,
          isComplaint: Boolean(isComplaint),
          complaintText: complaintText || undefined,
          complaintStatus: isComplaint ? 'pending' : 'none',
          contextType: 'class',
          contextId: booking._id,
          status: 'approved',
        })

        // Recalculate teacher rating average
        const allReviews = await TeacherReview.find({ teacherId: booking.teacherId, status: 'approved' })
        const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0)
        const avg = allReviews.length > 0 ? Number((totalRating / allReviews.length).toFixed(1)) : 5.0
        await TeacherProfile.findOneAndUpdate(
          { user: booking.teacherId },
          { $set: { rating: avg, ratingsCount: allReviews.length } }
        )
      }

      return res.json({
        success: true,
        message: 'نظر و ارزیابی شما با موفقیت ثبت گردید. با تشکر از همراهی شما.',
        data: booking.review,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/student/online-classes/book-multi
   * Request private class with up to 10 selected teachers + SMS notification + 30 min waiting
   */
  static async createMultiTeacherBooking(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const {
        teacherIds = [],
        courseId,
        courseName,
        gradeId,
        gradeName,
        subjectId,
        subjectName,
        educationLevel,
        topic,
        description,
        scheduledAt,
        capacity = 1,
      } = req.body

      if (!subjectName || !topic || !scheduledAt) {
        return res.status(400).json({
          success: false,
          message: 'درس، موضوع و تاریخ کلاس الزامی است.',
        })
      }

      const validCapacity = Math.max(1, Number(capacity) || 1)
      const targetList = Array.isArray(teacherIds) ? teacherIds.slice(0, 10) : []

      if (targetList.length === 0) {
        return res.status(400).json({ success: false, message: 'حداقل یک معلم باید انتخاب شود' })
      }

      // Calculate quote: base 500,000 or highest selected teacher base + (capacity - 1) * 80,000
      let maxTeacherBase = 500000
      const teacherProfiles = await TeacherProfile.find({ user: { $in: targetList } }).populate(
        'user',
        'fullName phoneNumber'
      )

      for (const p of teacherProfiles) {
        if (p.onlineClassBasePrice && p.onlineClassBasePrice > maxTeacherBase) {
          maxTeacherBase = p.onlineClassBasePrice
        }
      }

      const quote = OnlineClassService.calculateQuote({
        basePrice90Min: maxTeacherBase,
        durationMinutes: 90, // 1.5 hours
        capacity: validCapacity,
      })

      // Check student wallet
      const wallet = await WalletService.getOrCreateWallet(studentId, 'student')
      if (wallet.balance < quote.totalPrice) {
        return res.status(400).json({
          success: false,
          insufficientBalance: true,
          requiredAmount: quote.totalPrice,
          currentBalance: wallet.balance,
          message: `موجودی کیف پول شما (${wallet.balance.toLocaleString('fa-IR')} تومان) کافی نیست. مبلغ مورد نیاز برای کلاس ۱.۵ ساعته با ${validCapacity} دانش‌آموز: ${quote.totalPrice.toLocaleString('fa-IR')} تومان است. لطفاً ابتدا کیف پول را شارژ کنید.`,
        })
      }

      // Debit student wallet
      await WalletService.debit({
        userId: studentId,
        userType: 'student',
        amount: quote.totalPrice,
        type: 'class_fee',
        description: `رزرو کلاس خصوصی ۱.۵ ساعته: ${topic} (${validCapacity} نفر)`,
      })

      const startTime = new Date(scheduledAt)
      const endTime = new Date(startTime.getTime() + 90 * 60000)
      const bookingCode = `CLS-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`
      const meetingInfo = OnlineClassService.generateMeetingInfo(bookingCode)

      const waitingMinutes = 30
      const cannotCancelBefore = new Date(Date.now() + waitingMinutes * 60 * 1000)
      const waitingExpiresAt = cannotCancelBefore

      const booking = await OnlineClassBooking.create({
        bookingCode,
        studentId,
        targetTeacherIds: targetList,
        teacherId: targetList[0], // Temporary primary until claimed
        courseId: courseId || undefined,
        courseName: courseName || '',
        gradeId: gradeId || undefined,
        gradeName: gradeName || '',
        subjectId: subjectId || undefined,
        subjectName,
        educationLevel: educationLevel || 'secondary',
        topic: topic.trim(),
        description: description ? description.trim() : '',
        scheduledAt: startTime,
        durationMinutes: 90,
        endTime,
        capacity: validCapacity,
        pricing: quote,
        cannotCancelBefore,
        waitingExpiresAt,
        status: 'paid_pending_teacher',
        payment: {
          isPaid: true,
          paidAt: new Date(),
          paymentMethod: 'wallet',
          trackingCode: `PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        },
        meeting: meetingInfo,
      })

      // Send SMS notification to each selected teacher
      for (const p of teacherProfiles) {
        const teacherPhone = (p.user as any)?.phoneNumber
        if (teacherPhone) {
          SmsService.sendSimpleMessage(
            teacherPhone,
            `استاد گرامی، یک درخواست کلاس آنلاین ۱.۵ ساعته برای درس «${subjectName}» در کیتایار ثبت شد. لطفاً به میز کار خود مراجعه کنید.`
          ).catch(() => {})
        }
      }

      // ارسال پوش نوتیفیکیشن و اعلان به همه معلمان انتخاب شده
      try {
        const studentUser = await User.findById(studentId).select('fullName')
        const studentName = (studentUser as any)?.fullName || 'دانش‌آموز'
        const teacherUserIds = targetList.map((t: any) => t.toString())
        const teacherPhones = teacherProfiles
          .map((p) => (p.user as any)?.phoneNumber)
          .filter(Boolean)

        NotificationService.send({
          recipientType: 'teacher',
          recipientUserIds: teacherUserIds,
          recipientPhones: teacherPhones,
          senderId: studentId.toString(),
          senderName: studentName,
          senderRole: 'student',
          title: 'درخواست کلاس آنلاین جدید 📚',
          body: `${studentName} درخواست کلاس ۱.۵ ساعته «${topic.trim()}» ثبت کرده است. برای پذیرش ۳۰ دقیقه فرصت دارید.`,
          type: 'ONLINE_CLASS',
          priority: 'high',
          targetId: booking._id.toString(),
          data: {
            bookingId: booking._id.toString(),
            bookingCode: booking.bookingCode,
            topic: topic.trim(),
            scheduledAt: startTime.toISOString(),
          },
        }).catch((err) => logger.warn('Failed to send push notification to teachers:', err))
      } catch (notifErr) {
        logger.warn('Error queuing multi-teacher booking notification:', notifErr)
      }

      return res.json({
        success: true,
        message: 'درخواست کلاس خصوصی با موفقیت ثبت شد و پیامک برای معلمان منتخب ارسال گردید.',
        data: booking,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'خطا در ثبت کلاس' })
    }
  }
}

