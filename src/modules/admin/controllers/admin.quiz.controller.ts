import { Response } from 'express'
import { AuthRequest } from '../../../core/middleware/auth.js'
import { QuizConfig } from '../../../core/models/QuizConfig.js'
import { QuizMatch } from '../../../core/models/QuizMatch.js'
import { QuizProfile } from '../../../core/models/QuizProfile.js'
import { CoinTransaction } from '../../../core/models/CoinTransaction.js'
import { Question } from '../../../core/models/Question.js'
import { QuizMission } from '../../../core/models/QuizMission.js'
import { QuizCategory, ensureDefaultQuizCategories } from '../../../core/models/QuizCategory.js'
import { BOT_ROSTER, QuizGameEngineService } from '../../student/services/quizGameEngine.service.js'
import { v4 as uuidv4 } from 'uuid'

export class AdminQuizController {
  /**
   * آمار و داشبورد کلی بازی کوییز
   */
  static async getDashboard(req: AuthRequest, res: Response) {
    try {
      const totalMatches = await QuizMatch.countDocuments()
      const completedMatches = await QuizMatch.countDocuments({ status: 'completed' })
      const botMatches = await QuizMatch.countDocuments({ 'player2.isBot': true })
      const humanMatches = totalMatches - botMatches
      const totalPlayers = await QuizProfile.countDocuments()

      // آمار سکه‌های در گردش
      const coinTxs = await CoinTransaction.aggregate([
        {
          $group: {
            _id: '$type',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ])

      const recentMatches = await QuizMatch.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('matchId mode player1 player2 status winner createdAt')

      res.json({
        success: true,
        data: {
          totalMatches,
          completedMatches,
          botMatches,
          humanMatches,
          botMatchPercentage: totalMatches > 0 ? Math.round((botMatches / totalMatches) * 100) : 0,
          totalPlayers,
          coinTransactionsSummary: coinTxs,
          recentMatches,
        },
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * دریافت تنظیمات و قوانین بازی
   */
  static async getConfig(req: AuthRequest, res: Response) {
    try {
      const config = await QuizGameEngineService.getConfig()
      res.json({ success: true, data: config })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * به‌روزرسانی تنظیمات و قوانین بازی
   */
  static async updateConfig(req: AuthRequest, res: Response) {
    try {
      let config = await QuizConfig.findOne({ key: 'global' })
      if (!config) config = new QuizConfig({ key: 'global' })

      const {
        roundsPerMatch,
        questionsPerRound,
        questionTimerSeconds,
        maxHearts,
        heartRegenMinutes,
        winCoinReward,
        drawCoinReward,
        lossCoinReward,
        winXpReward,
        matchmakingTimeoutSeconds,
        botDistribution,
        botAccuracy,
        hintPrices,
        bots,
      } = req.body

      if (roundsPerMatch !== undefined) config.roundsPerMatch = roundsPerMatch
      if (questionsPerRound !== undefined) config.questionsPerRound = questionsPerRound
      if (questionTimerSeconds !== undefined) config.questionTimerSeconds = questionTimerSeconds
      if (maxHearts !== undefined) config.maxHearts = maxHearts
      if (heartRegenMinutes !== undefined) config.heartRegenMinutes = heartRegenMinutes
      if (winCoinReward !== undefined) config.winCoinReward = winCoinReward
      if (drawCoinReward !== undefined) config.drawCoinReward = drawCoinReward
      if (lossCoinReward !== undefined) config.lossCoinReward = lossCoinReward
      if (winXpReward !== undefined) config.winXpReward = winXpReward
      if (matchmakingTimeoutSeconds !== undefined) config.matchmakingTimeoutSeconds = matchmakingTimeoutSeconds
      if (botDistribution) config.botDistribution = botDistribution
      if (botAccuracy) config.botAccuracy = botAccuracy
      if (hintPrices) config.hintPrices = hintPrices
      if (Array.isArray(bots)) {
        config.bots = bots
          .filter((b: any) => b && typeof b.name === 'string' && b.name.trim())
          .map((b: any, idx: number) => ({
            id: typeof b.id === 'string' && b.id.trim() ? b.id.trim() : `bot_${Date.now()}_${idx}`,
            name: b.name.trim(),
            avatar: typeof b.avatar === 'string' && b.avatar.trim() ? b.avatar.trim() : 'avatar_opp1',
            difficulty: ['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'medium',
            isActive: b.isActive !== false,
          }))
      }

      await config.save()
      res.json({ success: true, data: config, message: 'تنظیمات با موفقیت ذخیره شد' })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * مدیریت ربات‌ها
   */
  static async getBots(req: AuthRequest, res: Response) {
    try {
      const config = await QuizGameEngineService.getConfig()
      res.json({
        success: true,
        data: {
          roster: config.bots || BOT_ROSTER,
          distribution: config.botDistribution,
          accuracy: config.botAccuracy,
          responseDelay: config.botResponseDelay,
        },
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * لیست و جستجوی بازیکنان
   */
  static async getPlayers(req: AuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const search = (req.query.search as string) || ''

      const query: any = {}
      const players = await QuizProfile.find(query)
        .sort({ xp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('user', 'fullName username phoneNumber')

      const total = await QuizProfile.countDocuments(query)

      res.json({
        success: true,
        data: {
          players,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * تغییر دستی و حسابرسی‌شده موجودی سکه بازیکن با دلیل
   */
  static async adjustCoins(req: AuthRequest, res: Response) {
    try {
      const { userId } = req.params
      const { amount, reason } = req.body
      const adminUserId = req.user?._id

      if (!amount || isNaN(Number(amount))) {
        return res.status(400).json({ success: false, message: 'مبلغ نامعتبر است' })
      }
      if (!reason || reason.trim().length < 3) {
        return res.status(400).json({ success: false, message: 'ذکر دلیل تغییر موجودی الزامی است' })
      }

      const profile = await QuizProfile.findOne({ user: userId })
      if (!profile) return res.status(404).json({ success: false, message: 'پروفایل بازیکن یافت نشد' })

      profile.coins = Math.max(0, profile.coins + Number(amount))
      await profile.save()

      const tx = await CoinTransaction.create({
        userId,
        amount: Number(amount),
        balanceAfter: profile.coins,
        type: 'admin_adjustment',
        idempotencyKey: `admin_adj_${userId}_${uuidv4()}`,
        description: `تغییر موجودی توسط مدیر: ${reason}`,
        adminUser: adminUserId,
        reason,
      })

      res.json({
        success: true,
        data: {
          userId,
          newBalance: profile.coins,
          transaction: tx,
        },
        message: 'موجودی بازیکن با موفقیت تغییر کرد و ثبت شد',
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * دریافت لیست موضوعات کوییز به همراه تعداد سوالات هر موضوع
   */
  static async getCategories(req: AuthRequest, res: Response) {
    try {
      await ensureDefaultQuizCategories()
      const categories = await QuizCategory.find().sort({ order: 1, createdAt: 1 }).lean()

      // شمارش سوالات فعال هر موضوع از کالکشن Question
      const counts = await Question.aggregate([
        { $match: { isActive: true } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
      ])
      const countMap = new Map<string, number>(counts.map((c: any) => [c._id, c.count]))

      const data = categories.map((cat: any) => ({
        ...cat,
        questionsCount: countMap.get(cat.name) || 0,
      }))

      res.json({ success: true, data })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * ایجاد موضوع جدید کوییز با آیکون و رنگ دلخواه
   */
  static async createCategory(req: AuthRequest, res: Response) {
    try {
      const { name, icon, color, isActive } = req.body
      const trimmed = typeof name === 'string' ? name.trim() : ''
      if (!trimmed) {
        return res.status(400).json({ success: false, message: 'نام موضوع الزامی است' })
      }

      const exists = await QuizCategory.findOne({ name: trimmed })
      if (exists) {
        return res.status(409).json({ success: false, message: 'موضوعی با این نام قبلاً ثبت شده است' })
      }

      const maxOrderDoc = await QuizCategory.findOne().sort({ order: -1 }).select('order').lean()
      const created = await QuizCategory.create({
        name: trimmed,
        icon: (icon || '💡').trim(),
        color: (color || '#3B82F6').trim(),
        isActive: isActive !== false,
        order: (maxOrderDoc?.order || 0) + 1,
      })

      res.status(201).json({ success: true, data: created, message: 'موضوع جدید با موفقیت ایجاد شد' })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * ویرایش موضوع کوییز (نام، آیکون، رنگ، وضعیت فعال)
   */
  static async updateCategory(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params
      const { name, icon, color, isActive, order } = req.body

      const cat = await QuizCategory.findById(id)
      if (!cat) {
        return res.status(404).json({ success: false, message: 'موضوع یافت نشد' })
      }

      const oldName = cat.name
      if (typeof name === 'string' && name.trim()) cat.name = name.trim()
      if (typeof icon === 'string' && icon.trim()) cat.icon = icon.trim()
      if (typeof color === 'string' && color.trim()) cat.color = color.trim()
      if (typeof isActive === 'boolean') cat.isActive = isActive
      if (typeof order === 'number') cat.order = order

      await cat.save()

      // اگر نام موضوع تغییر کرد، تگ سوالات مرتبط نیز همگام‌سازی شود
      if (oldName !== cat.name) {
        await Question.updateMany({ tags: oldName }, { $set: { 'tags.$': cat.name } })
      }

      res.json({ success: true, data: cat, message: 'موضوع با موفقیت ویرایش شد' })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * حذف موضوع کوییز
   */
  static async deleteCategory(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params
      const deleted = await QuizCategory.findByIdAndDelete(id)
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'موضوع یافت نشد' })
      }
      res.json({ success: true, message: 'موضوع با موفقیت حذف شد' })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * دریافت لیست سوالات کوییز (با قابلیت فیلتر بر اساس موضوع)
   */
  static async getQuizQuestions(req: AuthRequest, res: Response) {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category.trim() : ''
      const limit = Math.min(100, parseInt(req.query.limit as string) || 50)

      const filter: any = { isActive: true }
      if (category) {
        filter.tags = category
      } else {
        const cats = await QuizCategory.find().select('name').lean()
        const catNames = cats.map((c: any) => c.name)
        filter.tags = { $in: [...catNames, 'کوییز'] }
      }

      const questions = await Question.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('question options answer difficulty tags mainQuestion createdAt')
        .lean()

      res.json({ success: true, data: questions })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * حذف سوال کوییز
   */
  static async deleteQuizQuestion(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params
      const deleted = await Question.findByIdAndDelete(id)
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'سوال یافت نشد' })
      }
      res.json({ success: true, message: 'سوال با موفقیت حذف شد' })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * ایجاد سوال کوییز
   */
  static async createQuizQuestion(req: AuthRequest, res: Response) {
    try {
      const { question, options, answer, difficulty, category, explanation } = req.body
      const adminId = req.user?._id

      if (!question || !options || options.length < 4 || !answer) {
        return res.status(400).json({ success: false, message: 'صورت سوال، ۴ گزینه و پاسخ صحیح الزامی هستند' })
      }

      const catName = (category || 'اطلاعات عمومی').trim()
      // اطمینان از ثبت موضوع در کالکشن موضوعات کوییز
      await QuizCategory.updateOne(
        { name: catName },
        { $setOnInsert: { name: catName, icon: '💡', color: '#3B82F6', isActive: true } },
        { upsert: true }
      )

      const created = await Question.create({
        question,
        options,
        answer,
        difficulty: difficulty || 'متوسط',
        type: 'تستی',
        mainQuestion: explanation || '',
        createdBy: adminId,
        isActive: true,
        status: 'تایید-شده',
        tags: [catName],
      })

      res.json({ success: true, data: created, message: 'سوال با موفقیت ایجاد شد' })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }
}
