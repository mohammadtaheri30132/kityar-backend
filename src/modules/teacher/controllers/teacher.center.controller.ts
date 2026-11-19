import { Request, Response } from 'express'
import { Types } from 'mongoose'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { TeacherDailyAttendance } from '../../../core/models/TeacherDailyAttendance.js'
import { QuestionRequest } from '../../../core/models/QuestionRequest.js'
import { Conversation } from '../../../core/models/Conversation.js'
import { Message } from '../../../core/models/Message.js'
import { TeacherMaterial } from '../../../core/models/TeacherMaterial.js'
import { OnlineClass } from '../../../core/models/OnlineClass.js'
import { OnlineClassBooking } from '../../../core/models/OnlineClassBooking.js'
import { OnlineClassMembership } from '../../../core/models/OnlineClassMembership.js'
import { User } from '../../../core/models/User.js'
import { Classroom } from '../../../core/models/Classroom.js'
import { TeacherReview } from '../../../core/models/TeacherReview.js'
import { WalletService } from '../../../core/services/wallet.service.js'
import { OnlineClassService } from '../../../core/services/onlineClass.service.js'
import { SmsService } from '../../../core/services/sms.service.js'
import {
  extractWeeklyScheduleSummary,
  validateAndNormalizeWeeklySchedule,
} from '../../../core/utils/weeklySchedule.js'
import { Wallet } from '../../../core/models/Wallet.js'
import { WalletTransaction } from '../../../core/models/WalletTransaction.js'

function getTodayDateString(): string {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

export class TeacherCenterController {
  /**
   * Helper: Check and auto-release payouts older than 2 days with no pending objection
   */
  static async checkAndReleaseEligiblePayouts() {
    try {
      const eligible = await QuestionRequest.find({
        status: 'answered',
        payoutStatus: 'pending_review',
        payoutEligibleAt: { $lte: new Date() },
        $or: [
          { 'objection.hasObjection': false },
          { 'objection.hasObjection': { $exists: false } },
          { 'objection.status': 'resolved_paid' },
        ],
        price: { $gt: 0 },
      })

      for (const q of eligible) {
        const teacherId = q.claimedBy || q.teacherId
        if (teacherId) {
          try {
            await WalletService.credit({
              userId: teacherId,
              userType: 'teacher',
              amount: q.price,
              type: 'question_reward',
              description: `تسویه درآمد پاسخ به سوال: ${q.title} (تایید خودکار پس از ۲ روز)`,
              referenceId: q._id.toString(),
              referenceModel: 'QuestionRequest',
            })
            q.payoutStatus = 'approved'
            q.payoutPaidAt = new Date()
            await q.save()
          } catch (err: any) {
            console.error('Error auto-releasing payout for question:', q._id, err.message)
          }
        }
      }
    } catch (err: any) {
      console.error('Error in checkAndReleaseEligiblePayouts:', err.message)
    }
  }

  /**
   * GET /api/teacher/center/overview
   * Consolidated overview for the Teacher Center dashboard
   */
  static async getOverview(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      if (!userId) {
        return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' })
      }

      // Check and release any eligible question payouts automatically
      await TeacherCenterController.checkAndReleaseEligiblePayouts()

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
          rating: 5.0,
          ratingsCount: 0,
          rankingScore: 100,
        })
      }

      const todayStr = getTodayDateString()

      // Today's attendance
      const todayAttendance = await TeacherDailyAttendance.findOne({
        teacherId: userId,
        date: todayStr,
      })

      // Counters
      const [pendingRequests, activeConversations, scheduledClasses, publishedMaterials, wallet] =
        await Promise.all([
          QuestionRequest.countDocuments({
            $or: [
              { teacherId: userId, status: { $in: ['pending', 'claimed', 'in_progress'] } },
              { isBroadcast: true, status: 'pending' },
            ],
          }),
          Conversation.countDocuments({
            participants: userId,
            isActive: true,
          }),
          OnlineClass.countDocuments({
            teacherId: userId,
            status: { $in: ['scheduled', 'live'] },
          }),
          TeacherMaterial.countDocuments({
            teacherId: userId,
            status: 'published',
          }),
          WalletService.getOrCreateWallet(userId, 'teacher'),
        ])

      return res.json({
        success: true,
        data: {
          todayDate: todayStr,
          attendance: todayAttendance
            ? {
                status: todayAttendance.status,
                checkInTime: todayAttendance.checkInTime,
                checkOutTime: todayAttendance.checkOutTime,
                plannedHours: todayAttendance.plannedHours,
                actualHours: todayAttendance.actualHours,
                notes: todayAttendance.notes,
              }
            : {
                status: 'absent',
                plannedHours: 4,
                actualHours: 0,
                notes: '',
              },
          availability: {
            status: profile.availabilityStatus || 'offline',
            acceptingQuestions: profile.acceptingQuestions ?? true,
            lastHeartbeat: profile.lastHeartbeat,
            questionFee: profile.questionFee || 0,
            hourlyRate: profile.hourlyRate || 0,
          },
          counters: {
            pendingRequests,
            activeConversations,
            scheduledClasses,
            publishedMaterials,
          },
          wallet: {
            balance: wallet.balance,
            totalEarned: wallet.totalEarned,
          },
          profileSummary: {
            fullName: (req as any).user?.fullName || '',
            avatar: profile.avatar || '',
            headline: profile.headline || '',
            category: profile.category,
            position: profile.position,
            rating: profile.rating || 5.0,
            ratingsCount: profile.ratingsCount || 0,
            rankingScore: profile.rankingScore || 100,
            teachingSubjects: profile.teachingSubjects || [],
            teachingGrades: profile.teachingGrades || [],
            educationLevel: profile.educationLevel || 'secondary',
            availableSchedule: profile.availableSchedule || [],
            weeklySchedule: extractWeeklyScheduleSummary(profile.weeklySchedule).schedule,
          },
        },
      })
    } catch (error: any) {
      console.error('Error in getOverview:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/teacher/center/availability
   * Update real-time availability and question accepting status
   */
  static async updateAvailability(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { status, acceptingQuestions, questionFee, hourlyRate } = req.body

      const updateData: any = {
        lastHeartbeat: new Date(),
      }
      if (status) updateData.availabilityStatus = status
      if (typeof acceptingQuestions === 'boolean') updateData.acceptingQuestions = acceptingQuestions
      if (typeof questionFee === 'number') updateData.questionFee = questionFee
      if (typeof hourlyRate === 'number') updateData.hourlyRate = hourlyRate

      const profile = await TeacherProfile.findOneAndUpdate(
        { user: userId },
        { $set: updateData },
        { new: true }
      )

      return res.json({
        success: true,
        message: 'وضعیت دسترسی به‌روزرسانی شد',
        data: {
          status: profile?.availabilityStatus,
          acceptingQuestions: profile?.acceptingQuestions,
          lastHeartbeat: profile?.lastHeartbeat,
          questionFee: profile?.questionFee,
          hourlyRate: profile?.hourlyRate,
        },
      })
    } catch (error: any) {
      console.error('Error updating availability:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/teacher/center/heartbeat
   * Realtime presence keep-alive
   */
  static async heartbeat(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      await TeacherProfile.updateOne({ user: userId }, { $set: { lastHeartbeat: new Date() } })
      return res.json({ success: true, timestamp: new Date() })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * GET /api/teacher/center/attendance
   * List recent attendance records
   */
  static async getAttendance(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const records = await TeacherDailyAttendance.find({ teacherId: userId })
        .sort({ date: -1 })
        .limit(30)
      return res.json({ success: true, data: records })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/teacher/center/attendance
   * Record or update daily attendance
   */
  static async setDailyAttendance(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { date, status, plannedHours, actualHours, notes } = req.body

      const dateStr = date || getTodayDateString()

      const record = await TeacherDailyAttendance.findOneAndUpdate(
        { teacherId: userId, date: dateStr },
        {
          $set: {
            status: status || 'present',
            plannedHours: plannedHours !== undefined ? plannedHours : 4,
            actualHours: actualHours !== undefined ? actualHours : 0,
            notes: notes || '',
            ...(status === 'present' ? { checkInTime: new Date() } : {}),
          },
        },
        { upsert: true, new: true }
      )

      return res.json({
        success: true,
        message: 'حضور و غیاب روزانه با موفقیت ثبت شد',
        data: record,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * GET /api/teacher/center/requests
   * Student questions (Directly assigned + Targeted + Broadcast pool)
   */
  static async getRequests(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { tab } = req.query // 'direct' | 'broadcast' | 'pending' | 'my_active' | 'history'
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string) || 50, 100) : 50

      let query: any = {}

      if (tab === 'broadcast' || tab === 'pending') {
        // Pending questions available for this teacher to claim
        query = {
          status: 'pending',
          claimedBy: null,
          $or: [
            { isBroadcast: true },
            { teacherId: userId },
            { targetTeacherIds: userId },
          ],
        }
      } else if (tab === 'my_active') {
        query = {
          $or: [{ teacherId: userId }, { claimedBy: userId }],
          status: { $in: ['claimed', 'accepted', 'in_progress'] },
        }
      } else if (tab === 'history') {
        query = {
          $or: [{ teacherId: userId }, { claimedBy: userId }],
          status: { $in: ['answered', 'rejected', 'closed'] },
        }
      } else {
        // All active relevant to teacher
        query = {
          $or: [
            { teacherId: userId },
            { targetTeacherIds: userId, status: 'pending', claimedBy: null },
            { isBroadcast: true, status: 'pending', claimedBy: null },
            { claimedBy: userId },
          ],
        }
      }

      const requests = await QuestionRequest.find(query)
        .populate('studentId', 'fullName phoneNumber username avatar')
        .populate('gradeId', 'name')
        .populate('subjectId', 'name')
        .sort({ createdAt: -1 })
        .limit(limit)

      return res.json({ success: true, data: requests })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/teacher/center/requests/:id/claim-and-chat
   * Atomically claim question and immediately open chat session
   */
  static async claimAndAcceptRequest(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params

      // Concurrency-safe atomic claim: matches if pending and not yet claimed
      const claimed = await QuestionRequest.findOneAndUpdate(
        {
          _id: id,
          status: 'pending',
          claimedBy: null,
          $or: [
            { isBroadcast: true },
            { teacherId: userId },
            { targetTeacherIds: userId },
          ],
        },
        {
          $set: {
            claimedBy: userId,
            teacherId: userId,
            status: 'in_progress',
            claimedAt: new Date(),
          },
        },
        { new: true }
      ).populate('studentId', 'fullName avatar phoneNumber username')

      if (!claimed) {
        return res.status(409).json({
          success: false,
          message: 'این سوال قبلاً توسط معلم دیگری انتخاب شده است یا دیگر در دسترس نیست.',
        })
      }

      // Check or create conversation
      let conversation = null
      if (claimed.conversationId) {
        conversation = await Conversation.findById(claimed.conversationId)
      }

      const studentObj: any = claimed.studentId
      const studentId = studentObj?._id || studentObj

      if (!conversation) {
        conversation = await Conversation.create({
          type: 'question',
          participants: [studentId, userId],
          questionRequestId: claimed._id,
          lastMessage: `پرسش: ${claimed.title}`,
          lastMessageAt: new Date(),
          lastMessageSender: studentId,
          isActive: true,
        })
        claimed.conversationId = conversation._id as Types.ObjectId
        await claimed.save()

        // Insert initial message into conversation
        await Message.create({
          conversationId: conversation._id,
          senderId: studentId,
          content: `📌 موضوع سوال: ${claimed.title}\n\n${claimed.description}`,
          type: 'text',
          isRead: false,
        })
      }

      return res.json({
        success: true,
        message: 'سوال با موفقیت به شما اختصاص یافت و گفتگو آغاز شد.',
        data: {
          question: claimed,
          conversationId: conversation._id,
          studentName: studentObj?.fullName || 'دانش‌آموز',
          studentAvatar: studentObj?.avatar || undefined,
        },
      })
    } catch (error: any) {
      console.error('Error claiming and accepting question:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * POST /api/teacher/center/requests/:id/claim
   * Concurrency-safe atomic claim for broadcast questions
   */
  static async claimRequest(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params

      const claimed = await QuestionRequest.findOneAndUpdate(
        {
          _id: id,
          status: 'pending',
          claimedBy: null,
          $or: [
            { isBroadcast: true },
            { teacherId: userId },
            { targetTeacherIds: userId },
          ],
        },
        {
          $set: {
            claimedBy: userId,
            teacherId: userId,
            status: 'claimed',
            claimedAt: new Date(),
          },
        },
        { new: true }
      )

      if (!claimed) {
        return res.status(409).json({
          success: false,
          message: 'این سوال قبلاً توسط معلم دیگری انتخاب شده است یا در دسترس نیست.',
        })
      }

      return res.json({
        success: true,
        message: 'سوال با موفقیت به شما اختصاص یافت',
        data: claimed,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/teacher/center/requests/:id/accept
   * Accept question and establish conversation
   */
  static async acceptRequest(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params

      const request = await QuestionRequest.findOne({
        _id: id,
        $or: [{ teacherId: userId }, { claimedBy: userId }],
      })

      if (!request) {
        return res.status(404).json({ success: false, message: 'درخواست سوال یافت نشد' })
      }

      // Check or create conversation
      let conversation = null
      if (request.conversationId) {
        conversation = await Conversation.findById(request.conversationId)
      }

      if (!conversation) {
        conversation = await Conversation.create({
          type: 'question',
          participants: [request.studentId, userId],
          questionRequestId: request._id,
          lastMessage: `پرسش: ${request.title}`,
          lastMessageAt: new Date(),
          lastMessageSender: request.studentId,
        })
        request.conversationId = conversation._id as Types.ObjectId
      }

      request.status = 'in_progress'
      await request.save()

      return res.json({
        success: true,
        message: 'درخواست پذیرفته شد و گفتگوی آموزشی آغاز شد',
        data: { request, conversationId: conversation._id },
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/teacher/center/requests/:id/reject
   */
  static async rejectRequest(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params

      const request = await QuestionRequest.findOne({
        _id: id,
        $or: [{ teacherId: userId }, { claimedBy: userId }],
      })

      if (!request) {
        return res.status(404).json({ success: false, message: 'درخواست سوال یافت نشد' })
      }

      if (request.isBroadcast && request.status === 'claimed') {
        // Release broadcast question back to pool
        request.claimedBy = undefined
        request.teacherId = undefined
        request.status = 'pending'
      } else {
        request.status = 'rejected'
      }

      await request.save()

      return res.json({ success: true, message: 'درخواست لغو شد', data: request })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/teacher/center/requests/:id/answer
   * Mark as answered and place payout in escrow (pending admin review / 2-day auto release)
   */
  static async answerRequest(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params
      const { answerSummary } = req.body

      const request = await QuestionRequest.findOne({
        _id: id,
        $or: [{ teacherId: userId }, { claimedBy: userId }],
      })

      if (!request) {
        return res.status(404).json({ success: false, message: 'درخواست سوال یافت نشد' })
      }

      request.status = 'answered'
      request.answerSummary = answerSummary || ''
      request.answeredAt = new Date()
      // Retention: Chat remains accessible for 2 days
      request.chatRetentionUntil = new Date(Date.now() + 2 * 24 * 3600 * 1000)

      // Payout held in escrow: requires admin review or auto-approval after 2 days
      if (request.price > 0) {
        request.payoutStatus = 'pending_review'
        request.payoutEligibleAt = new Date(Date.now() + 2 * 24 * 3600 * 1000)
      } else {
        request.payoutStatus = 'none'
      }

      await request.save()

      return res.json({
        success: true,
        message: 'پاسخ شما با موفقیت ثبت شد. گفتگو تا ۲ روز در دسترس خواهد بود و مبلغ پس از بررسی کارشناس یا تایید خودکار واریز می‌شود.',
        data: request,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * GET /api/teacher/center/materials
   * List educational materials
   */
  static async getMaterials(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const materials = await TeacherMaterial.find({ teacherId: userId })
        .populate('gradeId', 'name')
        .populate('subjectId', 'name')
        .sort({ createdAt: -1 })
      return res.json({ success: true, data: materials })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/teacher/center/materials
   * Upload and publish material
   */
  static async createMaterial(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const {
        title,
        description,
        gradeId,
        subjectId,
        price,
        coverImageUrl,
        previewFileUrl,
        fullFileUrl,
        fileType,
        pageCount,
      } = req.body

      if (!title || !fullFileUrl) {
        return res.status(400).json({
          success: false,
          message: 'عنوان و فایل اصلی الزامی هستند',
        })
      }

      const material = await TeacherMaterial.create({
        teacherId: userId,
        title,
        description: description || '',
        gradeId: gradeId || undefined,
        subjectId: subjectId || undefined,
        price: Number(price) || 0,
        coverImageUrl: coverImageUrl || '',
        previewFileUrl: previewFileUrl || '',
        fullFileUrl,
        fileType: fileType || 'pdf',
        pageCount: Number(pageCount) || 0,
        status: 'published',
      })

      return res.json({
        success: true,
        message: 'محتوای آموزشی با موفقیت منتشر شد',
        data: material,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * DELETE /api/teacher/center/materials/:id
   */
  static async deleteMaterial(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params

      await TeacherMaterial.findOneAndDelete({ _id: id, teacherId: userId })
      return res.json({ success: true, message: 'محتوا حذف شد' })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * GET /api/teacher/center/classes
   * List teacher's online classes
   */
  static async getClasses(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const classes = await OnlineClass.find({ teacherId: userId })
        .populate('gradeId', 'name')
        .populate('subjectId', 'name')
        .populate('registeredStudents', 'fullName phoneNumber')
        .sort({ scheduledAt: -1 })
      return res.json({ success: true, data: classes })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/teacher/center/classes
   * Schedule new online class
   */
  static async createClass(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const {
        title,
        description,
        gradeId,
        subjectId,
        scheduledAt,
        durationMinutes,
        platform,
        meetingLink,
        accessCode,
        isFree,
        price,
        capacity,
      } = req.body

      if (!title || !scheduledAt || !meetingLink) {
        return res.status(400).json({
          success: false,
          message: 'عنوان، زمان برگزاری و لینک کلاس آنلاین الزامی است',
        })
      }

      const onlineClass = await OnlineClass.create({
        teacherId: userId,
        title,
        description: description || '',
        gradeId: gradeId || undefined,
        subjectId: subjectId || undefined,
        scheduledAt: new Date(scheduledAt),
        durationMinutes: Number(durationMinutes) || 60,
        platform: platform || 'jitsi',
        meetingLink,
        accessCode: accessCode || '',
        isFree: isFree !== undefined ? Boolean(isFree) : true,
        price: Number(price) || 0,
        capacity: Number(capacity) || 50,
        status: 'scheduled',
      })

      return res.json({
        success: true,
        message: 'کلاس آنلاین با موفقیت تعریف شد',
        data: onlineClass,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * DELETE /api/teacher/center/classes/:id
   */
  static async deleteClass(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { id } = req.params

      await OnlineClass.findOneAndUpdate(
        { _id: id, teacherId: userId },
        { $set: { status: 'cancelled' } }
      )
      return res.json({ success: true, message: 'کلاس لغو شد' })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * GET /api/teacher/center/wallet
   * Get wallet balance and ledger history
   */
  static async getWallet(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const wallet = await WalletService.getOrCreateWallet(userId, 'teacher')
      const transactions = await WalletTransaction.find({ userId })
        .sort({ createdAt: -1 })
        .limit(50)

      return res.json({
        success: true,
        data: {
          balance: wallet.balance,
          totalEarned: wallet.totalEarned,
          totalSpent: wallet.totalSpent,
          isFrozen: wallet.isFrozen,
          iban: wallet.iban,
          bankAccountHolder: wallet.bankAccountHolder,
          transactions,
        },
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * GET /api/teacher/center/reviews
   * Get student reviews and rating breakdown
   */
  static async getReviews(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const reviews = await TeacherReview.find({ teacherId: userId, status: 'approved' })
        .populate('studentId', 'fullName avatar')
        .sort({ createdAt: -1 })
        .limit(50)

      const profile = await TeacherProfile.findOne({ user: userId })

      return res.json({
        success: true,
        data: {
          averageRating: profile?.rating || 5.0,
          ratingsCount: profile?.ratingsCount || reviews.length,
          reviews,
        },
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/teacher/center/virtual-classroom
   * Teacher creates a unified online virtual classroom (`source: 'teacher_invitation'`)
   * and registers invited students in OnlineClassMembership so it appears directly in their "My Classes" list.
   */
  static async createVirtualClassroom(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const {
        name,
        title,
        grade,
        gradeName,
        subject,
        subjectName,
        maxStudents,
        studentCount,
        studentPhoneNumbers = [],
        invitedStudents = [],
        scheduledAt,
        durationMinutes = 90,
      } = req.body

      const resolvedTitle = (title || name || '').trim()
      const resolvedSubject = (subjectName || subject || 'کلاس عمومی').trim()
      const resolvedGrade = (gradeName || grade || '').trim()

      if (!resolvedTitle) {
        return res.status(400).json({ success: false, message: 'نام کلاس الزامی است' })
      }

      // Normalize invited student inputs (support both array of strings and array of objects)
      const normalizedInvites: Array<{ phoneNumber: string; fullName?: string }> = []
      const seenPhones = new Set<string>()
      const rawInviteList = [
        ...(Array.isArray(invitedStudents) ? invitedStudents : []),
        ...(Array.isArray(studentPhoneNumbers)
          ? studentPhoneNumbers.map((p: string) => ({ phoneNumber: p }))
          : []),
      ]
      for (const item of rawInviteList) {
        const rawPhone = typeof item === 'string' ? item : item?.phoneNumber
        if (!rawPhone || !String(rawPhone).trim()) continue
        const cleanPhone = SmsService.normalizePhone(String(rawPhone).trim())
        if (!seenPhones.has(cleanPhone)) {
          seenPhones.add(cleanPhone)
          normalizedInvites.push({
            phoneNumber: cleanPhone,
            fullName: typeof item === 'object' ? item?.fullName?.trim() : undefined,
          })
        }
      }

      const count = Math.max(
        1,
        Number(maxStudents) || Number(studentCount) || (normalizedInvites.length > 0 ? normalizedInvites.length : 1)
      )
      const totalFee = OnlineClassService.calculateVirtualClassroomFee(count)

      // Check teacher wallet balance
      const wallet = await WalletService.getOrCreateWallet(userId, 'teacher')
      if (wallet.balance < totalFee) {
        return res.status(400).json({
          success: false,
          insufficientBalance: true,
          requiredAmount: totalFee,
          currentBalance: wallet.balance,
          message: `موجودی کیف پول شما (${wallet.balance.toLocaleString('fa-IR')} تومان) برای ایجاد کلاس با ${count} دانش‌آموز کافی نیست. مبلغ مورد نیاز: ${totalFee.toLocaleString('fa-IR')} تومان است. لطفاً ابتدا کیف پول خود را شارژ کنید.`,
        })
      }

      const startTime = scheduledAt ? new Date(scheduledAt) : new Date()
      const validDuration = Math.max(15, Math.min(180, Number(durationMinutes) || 90))
      const endTime = new Date(startTime.getTime() + validDuration * 60000)

      // Debit from wallet
      await WalletService.debit({
        userId,
        userType: 'teacher',
        amount: totalFee,
        type: 'class_fee',
        description: `هزینه ایجاد کلاس مجازی: ${resolvedTitle} (${count} دانش‌آموز)`,
      })

      const bookingCode = `VCL-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`
      const meetingInfo = OnlineClassService.generateMeetingInfo(bookingCode)
      const classPublicBase = process.env.CLASSROOM_PUBLIC_URL || 'https://class.kitayar.ir'
      const joinUrl = `${classPublicBase}/classroom/native/${meetingInfo.roomName}`

      const invitedDocs: any[] = []
      const membershipDocs: any[] = []

      if (normalizedInvites.length > 0) {
        const matchedUsers = await User.find({
          phoneNumber: { $in: normalizedInvites.map((i) => i.phoneNumber) },
        }).select('_id fullName phoneNumber')
        const userByPhone = new Map<string, any>(
          matchedUsers.map((u: any) => [u.phoneNumber, u])
        )

        for (const inv of normalizedInvites) {
          const matchedUser = userByPhone.get(inv.phoneNumber)
          const resolvedName = inv.fullName || matchedUser?.fullName || 'دانش‌آموز دعوت‌شده'
          invitedDocs.push({
            studentId: matchedUser?._id,
            phoneNumber: inv.phoneNumber,
            fullName: resolvedName,
            status: 'invited',
            invitedAt: new Date(),
          })
          membershipDocs.push({
            studentId: matchedUser?._id,
            phoneNumber: inv.phoneNumber,
            fullName: resolvedName,
            role: 'invited',
            source: 'teacher_invitation',
            status: 'pending_invite',
            joinedAt: new Date(),
          })
        }
      }

      const unifiedBooking = await OnlineClassBooking.create({
        bookingCode,
        source: 'teacher_invitation',
        title: resolvedTitle,
        teacherId: userId,
        gradeName: resolvedGrade,
        subjectName: resolvedSubject,
        topic: resolvedTitle,
        description: `کلاس مجازی ایجاد شده توسط معلم (حداکثر ${count} دانش‌آموز)`,
        scheduledAt: startTime,
        durationMinutes: validDuration,
        endTime,
        capacity: count,
        invitedStudents: invitedDocs,
        pricing: {
          baseClassPrice: totalFee,
          extraCapacityCount: 0,
          extraCapacityFee: 0,
          subtotal: totalFee,
          studentServiceFee: 0,
          totalPrice: totalFee,
          perStudentShare: 0,
          teacherEarnings: 0,
          teacherServiceFee: 0,
        },
        status: 'confirmed',
        payment: {
          isPaid: true,
          paidAt: new Date(),
          paymentMethod: 'wallet',
          trackingCode: bookingCode,
        },
        meeting: meetingInfo,
      })

      if (membershipDocs.length > 0) {
        for (const m of membershipDocs) {
          await OnlineClassMembership.updateOne(
            m.studentId
              ? { bookingId: unifiedBooking._id, studentId: m.studentId }
              : { bookingId: unifiedBooking._id, phoneNumber: m.phoneNumber },
            { $setOnInsert: { ...m, bookingId: unifiedBooking._id } },
            { upsert: true }
          )
        }
      }

      return res.json({
        success: true,
        message: 'کلاس مجازی با موفقیت ایجاد شد و هزینه از کیف پول شما کسر گردید.',
        data: {
          ...unifiedBooking.toObject(),
          title: resolvedTitle,
          joinUrl,
          invitedCount: membershipDocs.length,
        },
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * GET /api/teacher/center/search-student?phone=...
   * Search student by phone number so teacher can invite registered students to virtual classes
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
          message: 'دانش‌آموزی با این شماره در نوکیتا یافت نشد (پس از ثبت‌نام، دعوت برای او فعال می‌شود).',
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
   * POST /api/teacher/center/reserve-online-class
   * Teacher reserves their own 1.5-hour online class session:
   * 80,000 Tomans base + 50,000 Tomans per added student
   * Duration: 90 mins active + 5 mins buffer = 95 minutes
   */
  static async reserveOnlineClassSession(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const { title, description, gradeId, subjectId, scheduledAt, capacity = 1 } = req.body

      if (!title || !scheduledAt) {
        return res.status(400).json({ success: false, message: 'عنوان و زمان شروع کلاس الزامی است' })
      }

      const validCapacity = Math.max(1, Number(capacity) || 1)
      const totalFee = OnlineClassService.calculateTeacherReservationFee(validCapacity)

      const wallet = await WalletService.getOrCreateWallet(userId, 'teacher')
      if (wallet.balance < totalFee) {
        return res.status(400).json({
          success: false,
          insufficientBalance: true,
          requiredAmount: totalFee,
          currentBalance: wallet.balance,
          message: `موجودی کیف پول شما کافی نیست. هزینه رزرو کلاس ۱.۵ ساعته برای ${validCapacity} دانش‌آموز: ${totalFee.toLocaleString('fa-IR')} تومان است. لطفاً ابتدا کیف پول خود را شارژ کنید.`,
        })
      }

      await WalletService.debit({
        userId,
        userType: 'teacher',
        amount: totalFee,
        type: 'class_fee',
        description: `رزرو کلاس آنلاین ۱.۵ ساعته: ${title} (${validCapacity} دانش‌آموز)`,
      })

      const meetingCode = `ROOM-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`
      const meetingLink = `https://meet.kitayar.ir/${meetingCode}`

      const onlineClass = await OnlineClass.create({
        teacherId: userId,
        title,
        description: description || '',
        gradeId: gradeId || undefined,
        subjectId: subjectId || undefined,
        scheduledAt: new Date(scheduledAt),
        durationMinutes: 90,
        maxAllowedSeconds: 95 * 60, // 95 minutes active window (1.5h + 5 min buffer)
        totalActiveSeconds: 0,
        platform: 'other',
        meetingLink,
        accessCode: meetingCode,
        isFree: false,
        price: totalFee,
        costPaid: totalFee,
        capacity: validCapacity,
        status: 'scheduled',
      })

      return res.json({
        success: true,
        message: 'کلاس آنلاین ۱.۵ ساعته شما با موفقیت رزرو شد.',
        data: onlineClass,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * PUT /api/teacher/center/workdesk-settings
   * Complete teacher work desk setup: subjects, grades, schedule, resume, pricing
   */
  static async updateWorkDeskSettings(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id
      const {
        teachingSubjects,
        teachingGrades,
        educationLevel,
        availableSchedule,
        weeklySchedule,
        questionFee,
        onlineClassBasePrice,
        resume,
        headline,
        bio,
      } = req.body

      if (weeklySchedule !== undefined) {
        const validation = validateAndNormalizeWeeklySchedule(weeklySchedule)
        if (!validation.valid) {
          return res.status(400).json({ success: false, message: validation.error })
        }
      }

      let profile = await TeacherProfile.findOne({ user: userId })
      if (!profile) {
        profile = new TeacherProfile({ user: userId })
      }

      if (Array.isArray(teachingSubjects)) profile.teachingSubjects = teachingSubjects
      if (Array.isArray(teachingGrades)) profile.teachingGrades = teachingGrades
      if (educationLevel) profile.educationLevel = educationLevel
      if (Array.isArray(availableSchedule)) profile.availableSchedule = availableSchedule
      if (weeklySchedule !== undefined) {
        const validation = validateAndNormalizeWeeklySchedule(weeklySchedule)
        if (validation.valid) profile.weeklySchedule = validation.schedule
      }
      if (typeof questionFee === 'number') profile.questionFee = questionFee
      if (typeof onlineClassBasePrice === 'number') profile.onlineClassBasePrice = onlineClassBasePrice
      if (resume) profile.resume = { ...profile.resume, ...resume }
      if (headline !== undefined) profile.headline = headline
      if (bio !== undefined) profile.bio = bio

      await profile.save()

      return res.json({
        success: true,
        message: 'اطلاعات میز کار و مهارت‌های تدریس با موفقیت بروزرسانی شد',
        data: profile,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }
}
