import { Response } from 'express'
import { AuthRequest } from '../../../core/middleware/auth.js'
import { QuizConfig } from '../../../core/models/QuizConfig.js'
import { QuizMatch } from '../../../core/models/QuizMatch.js'
import { QuizProfile } from '../../../core/models/QuizProfile.js'
import { CoinTransaction } from '../../../core/models/CoinTransaction.js'
import { Question } from '../../../core/models/Question.js'
import { QuizMission } from '../../../core/models/QuizMission.js'
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
          roster: BOT_ROSTER,
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
   * ایجاد سوال کوییز
   */
  static async createQuizQuestion(req: AuthRequest, res: Response) {
    try {
      const { question, options, answer, difficulty, category, explanation } = req.body
      const adminId = req.user?._id

      if (!question || !options || options.length < 4 || !answer) {
        return res.status(400).json({ success: false, message: 'صورت سوال، ۴ گزینه و پاسخ صحیح الزامی هستند' })
      }

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
        tags: [category || 'کوییز'],
      })

      res.json({ success: true, data: created, message: 'سوال با موفقیت ایجاد شد' })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }
}
