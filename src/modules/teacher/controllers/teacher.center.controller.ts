import { Request, Response } from 'express'
import { Types } from 'mongoose'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { TeacherDailyAttendance } from '../../../core/models/TeacherDailyAttendance.js'
import { QuestionRequest } from '../../../core/models/QuestionRequest.js'
import { Conversation } from '../../../core/models/Conversation.js'
import { Message } from '../../../core/models/Message.js'
import { TeacherMaterial } from '../../../core/models/TeacherMaterial.js'
import { OnlineClass } from '../../../core/models/OnlineClass.js'
import { TeacherReview } from '../../../core/models/TeacherReview.js'
import { WalletService } from '../../../core/services/wallet.service.js'
import { Wallet } from '../../../core/models/Wallet.js'
import { WalletTransaction } from '../../../core/models/WalletTransaction.js'

function getTodayDateString(): string {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

export class TeacherCenterController {
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
   * Mark as answered and credit reward/fee to teacher wallet
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
      await request.save()

      // If there is a fee, credit teacher wallet
      if (request.price > 0) {
        await WalletService.credit({
          userId,
          userType: 'teacher',
          amount: request.price,
          type: 'question_reward',
          description: `درآمد پاسخ به سوال: ${request.title}`,
          referenceId: request._id.toString(),
          referenceModel: 'QuestionRequest',
        })
      }

      return res.json({
        success: true,
        message: 'پاسخ به سوال ثبت شد',
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
}
