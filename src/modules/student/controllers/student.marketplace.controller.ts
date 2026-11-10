import { Request, Response } from 'express'
import { Types } from 'mongoose'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { User } from '../../../core/models/User.js'
import { QuestionRequest } from '../../../core/models/QuestionRequest.js'
import { Conversation } from '../../../core/models/Conversation.js'
import { TeacherMaterial } from '../../../core/models/TeacherMaterial.js'
import { MaterialPurchase } from '../../../core/models/MaterialPurchase.js'
import { OnlineClass } from '../../../core/models/OnlineClass.js'
import { TeacherReview } from '../../../core/models/TeacherReview.js'
import { WalletService } from '../../../core/services/wallet.service.js'
import { WalletTransaction } from '../../../core/models/WalletTransaction.js'

export class StudentMarketplaceController {
  /**
   * GET /api/student/teachers
   * Discovery directory with search & filters
   */
  static async getTeachers(req: Request, res: Response) {
    try {
      const { search, category, onlineOnly, minRating } = req.query

      const query: any = { isActive: true }

      if (category) {
        query.category = category
      }

      if (onlineOnly === 'true') {
        query.availabilityStatus = { $in: ['online', 'available_for_questions'] }
      }

      if (minRating) {
        query.rating = { $gte: Number(minRating) }
      }

      let profiles = await TeacherProfile.find(query)
        .populate('user', 'fullName phoneNumber avatar')
        .sort({ rankingScore: -1, rating: -1 })
        .limit(60)

      if (search && typeof search === 'string') {
        const searchRegex = new RegExp(search.trim(), 'i')
        profiles = profiles.filter((p: any) => {
          const name = p.user?.fullName || ''
          const headline = p.headline || ''
          const bio = p.bio || ''
          return searchRegex.test(name) || searchRegex.test(headline) || searchRegex.test(bio)
        })
      }

      const formatted = profiles.map((p: any) => ({
        id: p.user?._id,
        teacherProfileId: p._id,
        fullName: p.user?.fullName || 'استاد محترم',
        headline: p.headline || '',
        bio: p.bio || '',
        avatar: p.avatar || p.user?.avatar || '',
        category: p.category,
        position: p.position,
        experienceYears: p.experienceYears || 0,
        availabilityStatus: p.availabilityStatus || 'offline',
        acceptingQuestions: p.acceptingQuestions ?? true,
        questionFee: p.questionFee || 0,
        hourlyRate: p.hourlyRate || 0,
        rating: p.rating || 5.0,
        ratingsCount: p.ratingsCount || 0,
      }))

      return res.json({ success: true, data: formatted })
    } catch (error: any) {
      console.error('Error fetching teachers directory:', error)
      return res.status(500).json({ success: false, message: error.message || 'خطای سرور' })
    }
  }

  /**
   * GET /api/student/teachers/:id
   * Public profile of a specific teacher
   */
  static async getTeacherPublicProfile(req: Request, res: Response) {
    try {
      const { id } = req.params
      const teacherId = Array.isArray(id) ? id[0] : id

      const profile = await TeacherProfile.findOne({
        $or: [{ user: teacherId }, { _id: Types.ObjectId.isValid(teacherId) ? teacherId : null }],
      }).populate('user', 'fullName phoneNumber avatar')

      if (!profile) {
        return res.status(404).json({ success: false, message: 'پروفایل معلم یافت نشد' })
      }

      const [materialsCount, reviews, onlineClasses] = await Promise.all([
        TeacherMaterial.countDocuments({ teacherId: profile.user._id, status: 'published' }),
        TeacherReview.find({ teacherId: profile.user._id, status: 'approved' })
          .populate('studentId', 'fullName')
          .sort({ createdAt: -1 })
          .limit(20),
        OnlineClass.find({
          teacherId: profile.user._id,
          status: 'scheduled',
          scheduledAt: { $gte: new Date() },
        }).limit(5),
      ])

      return res.json({
        success: true,
        data: {
          id: profile.user?._id,
          teacherProfileId: profile._id,
          fullName: (profile.user as any)?.fullName || '',
          headline: profile.headline || '',
          bio: profile.bio || '',
          avatar: profile.avatar || '',
          category: profile.category,
          position: profile.position,
          schools: profile.schools || [],
          experienceYears: profile.experienceYears || 0,
          resume: profile.resume || { experiences: [], education: [], skills: [], certificates: [] },
          availabilityStatus: profile.availabilityStatus || 'offline',
          acceptingQuestions: profile.acceptingQuestions ?? true,
          questionFee: profile.questionFee || 0,
          hourlyRate: profile.hourlyRate || 0,
          rating: profile.rating || 5.0,
          ratingsCount: profile.ratingsCount || 0,
          materialsCount,
          reviews,
          onlineClasses,
        },
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/student/questions
   * Submit new direct or broadcast question
   */
  static async submitQuestion(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const {
        teacherId,
        targetTeacherIds,
        isBroadcast,
        title,
        description,
        gradeId,
        gradeName,
        subjectId,
        subjectName,
        educationLevel,
        attachments,
        price,
      } = req.body

      if (!title || !description) {
        return res.status(400).json({
          success: false,
          message: 'عنوان و شرح سوال الزامی است',
        })
      }

      // Default question fee is 50,000 Tomans
      let questionPrice = 50000
      if (price !== undefined && Number(price) >= 0) {
        questionPrice = Number(price)
      } else if (!isBroadcast && teacherId) {
        const tProfile = await TeacherProfile.findOne({ user: teacherId })
        if (tProfile?.questionFee && tProfile.questionFee > 0) {
          questionPrice = tProfile.questionFee
        }
      }

      // Check student wallet balance
      const wallet = await WalletService.getOrCreateWallet(studentId, 'student')
      if (wallet.balance < questionPrice) {
        return res.status(400).json({
          success: false,
          insufficientBalance: true,
          requiredAmount: questionPrice,
          currentBalance: wallet.balance,
          message: `موجودی کیف پول شما (${wallet.balance.toLocaleString('fa-IR')} تومان) برای ثبت این سوال کافی نیست. مبلغ مورد نیاز: ${questionPrice.toLocaleString('fa-IR')} تومان است. لطفاً ابتدا کیف پول خود را شارژ کنید.`,
        })
      }

      // If question fee > 0, debit student wallet atomically
      if (questionPrice > 0) {
        await WalletService.debit({
          userId: studentId,
          userType: 'student',
          amount: questionPrice,
          type: 'question_fee',
          description: `هزینه ثبت سوال در «کمک از معلم»: ${title}`,
        })
      }

      const targetList =
        Array.isArray(targetTeacherIds) && targetTeacherIds.length > 0
          ? targetTeacherIds
          : teacherId
          ? [teacherId]
          : undefined

      const waitingMinutes = 30
      const cannotCancelBefore = new Date(Date.now() + waitingMinutes * 60 * 1000)
      const waitingExpiresAt = cannotCancelBefore

      const question = await QuestionRequest.create({
        studentId,
        teacherId:
          !isBroadcast && teacherId
            ? teacherId
            : targetList && targetList.length === 1
            ? targetList[0]
            : undefined,
        targetTeacherIds: !isBroadcast && targetList ? targetList : undefined,
        isBroadcast: Boolean(isBroadcast),
        title,
        description,
        gradeId: gradeId || undefined,
        gradeName: gradeName || '',
        subjectId: subjectId || undefined,
        subjectName: subjectName || '',
        educationLevel: educationLevel || 'secondary',
        attachments: attachments || [],
        status: 'pending',
        price: questionPrice,
        cannotCancelBefore,
        waitingExpiresAt,
        payoutStatus: 'none',
      })

      return res.json({
        success: true,
        message: 'سوال شما با موفقیت ثبت شد و به معلمان ارسال گردید',
        data: question,
      })
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || 'خطا در ثبت سوال' })
    }
  }

  /**
   * POST /api/student/questions/:id/cancel
   * Cancel question after 30-minute waiting window has passed
   */
  static async cancelQuestion(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const { id } = req.params

      const question = await QuestionRequest.findOne({ _id: id, studentId })
      if (!question) {
        return res.status(404).json({ success: false, message: 'سوال یافت نشد' })
      }

      if (question.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'این سوال در حال حاضر توسط معلم در حال بررسی یا پاسخ‌گویی است و قابل لغو نیست.',
        })
      }

      if (question.cannotCancelBefore && new Date() < question.cannotCancelBefore) {
        const remainingMinutes = Math.ceil((question.cannotCancelBefore.getTime() - Date.now()) / (60 * 1000))
        return res.status(400).json({
          success: false,
          message: `امکان لغو سوال تا ۳۰ دقیقه پس از ثبت وجود ندارد. (${remainingMinutes} دقیقه باقی‌مانده است).`,
        })
      }

      question.status = 'closed'
      await question.save()

      // Refund to student wallet
      if (question.price > 0) {
        await WalletService.credit({
          userId: studentId,
          userType: 'student',
          amount: question.price,
          type: 'deposit',
          description: `استرداد وجه لغو سوال: ${question.title}`,
        })
      }

      return res.json({
        success: true,
        message: 'سوال با موفقیت لغو شد و مبلغ به کیف پول شما استرداد گردید.',
        data: question,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/student/questions/:id/objection
   * Student submits dispute / objection about the answer quality
   */
  static async submitQuestionObjection(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const { id } = req.params
      const { reason } = req.body

      if (!reason || !reason.trim()) {
        return res.status(400).json({ success: false, message: 'لطفاً شرح اعتراض خود را وارد نمایید' })
      }

      const question = await QuestionRequest.findOne({ _id: id, studentId })
      if (!question) {
        return res.status(404).json({ success: false, message: 'سوال یافت نشد' })
      }

      question.objection = {
        hasObjection: true,
        reason: reason.trim(),
        filedAt: new Date(),
        status: 'pending',
      }
      question.payoutStatus = 'pending_review'
      await question.save()

      return res.json({
        success: true,
        message: 'اعتراض شما با موفقیت ثبت شد و برای بررسی کارشناس و مدیریت ارسال گردید.',
        data: question,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * GET /api/student/questions
   * List student's submitted questions
   */
  static async getMyQuestions(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const questions = await QuestionRequest.find({ studentId })
        .populate('teacherId', 'fullName avatar')
        .populate('claimedBy', 'fullName avatar')
        .sort({ createdAt: -1 })
      return res.json({ success: true, data: questions })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * GET /api/student/materials
   * Browse educational materials marketplace
   */
  static async getMaterials(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const { search, gradeId, subjectId, freeOnly } = req.query

      const query: any = { status: 'published' }
      if (gradeId) query.gradeId = gradeId
      if (subjectId) query.subjectId = subjectId
      if (freeOnly === 'true') query.price = 0
      if (search && typeof search === 'string') {
        query.title = { $regex: search.trim(), $options: 'i' }
      }

      const materials = await TeacherMaterial.find(query)
        .populate('teacherId', 'fullName avatar')
        .populate('gradeId', 'name')
        .populate('subjectId', 'name')
        .sort({ rating: -1, salesCount: -1 })
        .limit(50)

      // Get list of purchased material IDs by this student
      let purchasedIds: string[] = []
      if (studentId) {
        const purchases = await MaterialPurchase.find({ studentId }).select('materialId')
        purchasedIds = purchases.map((p) => p.materialId.toString())
      }

      const formatted = materials.map((m: any) => ({
        id: m._id,
        title: m.title,
        description: m.description,
        teacher: {
          id: m.teacherId?._id,
          fullName: m.teacherId?.fullName || 'مدرس',
        },
        grade: m.gradeId?.name || '',
        subject: m.subjectId?.name || '',
        price: m.price,
        coverImageUrl: m.coverImageUrl,
        previewFileUrl: m.previewFileUrl,
        fileType: m.fileType,
        pageCount: m.pageCount,
        salesCount: m.salesCount,
        rating: m.rating,
        isPurchased: purchasedIds.includes(m._id.toString()) || m.price === 0,
        createdAt: m.createdAt,
      }))

      return res.json({ success: true, data: formatted })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/student/materials/:id/purchase
   * Atomic wallet purchase of educational material
   */
  static async purchaseMaterial(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const { id } = req.params

      const material = await TeacherMaterial.findById(id)
      if (!material || material.status !== 'published') {
        return res.status(404).json({ success: false, message: 'محتوای آموزشی یافت نشد' })
      }

      // Check if already purchased
      const existing = await MaterialPurchase.findOne({ studentId, materialId: id })
      if (existing) {
        return res.json({
          success: true,
          message: 'این محتوا قبلاً توسط شما خریداری شده است',
          data: { downloadToken: existing.downloadToken },
        })
      }

      let tx: any = null

      if (material.price > 0) {
        // Debit student wallet
        const debitResult = await WalletService.debit({
          userId: studentId,
          userType: 'student',
          amount: material.price,
          type: 'material_purchase',
          description: `خرید محتوای آموزشی: ${material.title}`,
          referenceId: material._id.toString(),
          referenceModel: 'TeacherMaterial',
        })
        tx = debitResult.transaction

        // Platform commission is 30%, teacher receives 70%
        const platformCommissionRate = 0.30
        const teacherShare = Math.round(material.price * (1 - platformCommissionRate))

        // Credit teacher wallet
        await WalletService.credit({
          userId: material.teacherId,
          userType: 'teacher',
          amount: teacherShare,
          type: 'material_sale',
          description: `درآمد حاصل از فروش جزوه/محتوا: ${material.title} (سهم ۷۰٪ پس از کسر ۳۰٪ کارمزد پلتفرم)`,
          referenceId: material._id.toString(),
          referenceModel: 'TeacherMaterial',
        })
      }

      // Record purchase entitlement
      const purchase = await MaterialPurchase.create({
        materialId: material._id,
        studentId,
        pricePaid: material.price,
        transactionId: tx?._id,
      })

      // Increment material stats
      await TeacherMaterial.findByIdAndUpdate(material._id, {
        $inc: { salesCount: 1, totalEarnings: Math.round(material.price * 0.7) },
      })

      return res.json({
        success: true,
        message: 'خرید با موفقیت انجام شد',
        data: {
          purchaseId: purchase._id,
          downloadToken: purchase.downloadToken,
          fullFileUrl: material.fullFileUrl,
        },
      })
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || 'خطا در خرید محتوا' })
    }
  }

  /**
   * GET /api/student/materials/:id/download
   * Secure entitlement check before delivering full file
   */
  static async downloadMaterial(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const { id } = req.params

      const material = await TeacherMaterial.findById(id)
      if (!material) {
        return res.status(404).json({ success: false, message: 'محتوا یافت نشد' })
      }

      if (material.price > 0) {
        const entitlement = await MaterialPurchase.findOne({ studentId, materialId: id })
        if (!entitlement) {
          return res.status(403).json({
            success: false,
            message: 'برای دریافت این فایل ابتدا باید آن را خریداری کنید.',
          })
        }
        await MaterialPurchase.findByIdAndUpdate(entitlement._id, { $inc: { downloadCount: 1 } })
      }

      return res.json({
        success: true,
        data: {
          downloadUrl: material.fullFileUrl,
          fileName: material.title,
          fileType: material.fileType,
        },
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * GET /api/student/materials/my-purchases
   */
  static async getMyPurchasedMaterials(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const purchases = await MaterialPurchase.find({ studentId })
        .populate({
          path: 'materialId',
          populate: { path: 'teacherId', select: 'fullName' },
        })
        .sort({ createdAt: -1 })

      return res.json({ success: true, data: purchases })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * GET /api/student/classes
   * List upcoming online classes
   */
  static async getClasses(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const classes = await OnlineClass.find({
        status: { $in: ['scheduled', 'live'] },
      })
        .populate('teacherId', 'fullName avatar')
        .populate('gradeId', 'name')
        .populate('subjectId', 'name')
        .sort({ scheduledAt: 1 })

      const formatted = classes.map((c: any) => ({
        id: c._id,
        title: c.title,
        description: c.description,
        teacher: {
          id: c.teacherId?._id,
          fullName: c.teacherId?.fullName || 'مدرس',
          avatar: c.teacherId?.avatar || '',
        },
        grade: c.gradeId?.name || '',
        subject: c.subjectId?.name || '',
        scheduledAt: c.scheduledAt,
        durationMinutes: c.durationMinutes,
        platform: c.platform,
        meetingLink: c.meetingLink,
        isFree: c.isFree,
        price: c.price,
        capacity: c.capacity,
        registeredCount: c.registeredStudents?.length || 0,
        isRegistered: c.registeredStudents?.some((s: any) => s.toString() === studentId.toString()),
        status: c.status,
      }))

      return res.json({ success: true, data: formatted })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/student/classes/:id/register
   * Register or join online class
   */
  static async registerClass(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const { id } = req.params

      const onlineClass = await OnlineClass.findById(id)
      if (!onlineClass || onlineClass.status === 'cancelled') {
        return res.status(404).json({ success: false, message: 'کلاس آنلاین یافت نشد' })
      }

      const isAlreadyRegistered = onlineClass.registeredStudents.some(
        (s) => s.toString() === studentId.toString()
      )
      if (isAlreadyRegistered) {
        return res.json({
          success: true,
          message: 'شما قبلاً در این کلاس ثبت‌نام کرده‌اید',
          data: { meetingLink: onlineClass.meetingLink, accessCode: onlineClass.accessCode },
        })
      }

      if (onlineClass.registeredStudents.length >= onlineClass.capacity) {
        return res.status(400).json({ success: false, message: 'ظرفیت کلاس تکمیل شده است' })
      }

      if (!onlineClass.isFree && onlineClass.price > 0) {
        await WalletService.debit({
          userId: studentId,
          userType: 'student',
          amount: onlineClass.price,
          type: 'class_fee',
          description: `هزینه ثبت‌نام در کلاس آنلاین: ${onlineClass.title}`,
          referenceId: onlineClass._id.toString(),
          referenceModel: 'OnlineClass',
        })

        await WalletService.credit({
          userId: onlineClass.teacherId,
          userType: 'teacher',
          amount: onlineClass.price,
          type: 'class_earning',
          description: `درآمد حاصل از ثبت‌نام دانش‌آموز در کلاس: ${onlineClass.title}`,
          referenceId: onlineClass._id.toString(),
          referenceModel: 'OnlineClass',
        })
      }

      onlineClass.registeredStudents.push(studentId)
      await onlineClass.save()

      return res.json({
        success: true,
        message: 'ثبت‌نام در کلاس با موفقیت انجام شد',
        data: { meetingLink: onlineClass.meetingLink, accessCode: onlineClass.accessCode },
      })
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || 'خطا در ثبت‌نام' })
    }
  }

  /**
   * GET /api/student/wallet
   */
  static async getWallet(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const wallet = await WalletService.getOrCreateWallet(studentId, 'student')
      const transactions = await WalletTransaction.find({ userId: studentId })
        .sort({ createdAt: -1 })
        .limit(50)

      return res.json({
        success: true,
        data: {
          balance: wallet.balance,
          totalSpent: wallet.totalSpent,
          isFrozen: wallet.isFrozen,
          transactions,
        },
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/student/teachers/:id/reviews
   * Submit evaluation for teacher
   */
  static async submitReview(req: Request, res: Response) {
    try {
      const studentId = (req as any).user?._id
      const { id } = req.params
      const { rating, comment, contextType } = req.body

      const numRating = Number(rating)
      if (!numRating || numRating < 1 || numRating > 5) {
        return res.status(400).json({ success: false, message: 'امتیاز باید بین ۱ تا ۵ باشد' })
      }

      const review = await TeacherReview.create({
        teacherId: id,
        studentId,
        rating: numRating,
        comment: comment || '',
        contextType: contextType || 'general',
      })

      // Recalculate teacher average rating
      const allReviews = await TeacherReview.find({ teacherId: id, status: 'approved' })
      const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / (allReviews.length || 1)

      await TeacherProfile.updateOne(
        { user: id },
        {
          $set: {
            rating: Number(avg.toFixed(1)),
            ratingsCount: allReviews.length,
          },
        }
      )

      return res.json({
        success: true,
        message: 'نظر و امتیاز شما با موفقیت ثبت شد',
        data: review,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }
}
