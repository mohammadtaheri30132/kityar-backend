import { Response } from 'express'
import { AuthRequest } from '../../../core/middleware/auth.js'
import { QuizGameEngineService } from '../services/quizGameEngine.service.js'
import { QuizMission, StudentMissionProgress } from '../../../core/models/QuizMission.js'
import { CoinTransaction } from '../../../core/models/CoinTransaction.js'
import { QuizProfile } from '../../../core/models/QuizProfile.js'
import { Question } from '../../../core/models/Question.js'
import { v4 as uuidv4 } from 'uuid'

export class StudentQuizController {
  /**
   * دریافت پروفایل، آمار و اطلاعات اقتصادی دانش‌آموز
   */
  static async getProfile(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id?.toString()
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const profile = await QuizGameEngineService.getOrCreateProfile(userId)
      const config = await QuizGameEngineService.getConfig()

      const now = Date.now()
      const lastRegen = profile.lastHeartRegen ? new Date(profile.lastHeartRegen).getTime() : now
      const intervalMs = (config.heartRegenMinutes || 60) * 60 * 1000
      const nextHeartSeconds = profile.hearts < config.maxHearts ? Math.max(0, Math.floor((lastRegen + intervalMs - now) / 1000)) : 0

      // بررسی وضعیت دریافت جایزه روزانه
      const today = new Date().toISOString().split('T')[0]
      const lastClaimStr = profile.lastDailyClaim ? new Date(profile.lastDailyClaim).toISOString().split('T')[0] : null
      const canClaimDaily = lastClaimStr !== today

      res.json({
        success: true,
        data: {
          coins: profile.coins,
          hearts: profile.hearts,
          maxHearts: config.maxHearts,
          nextHeartSeconds,
          xp: profile.xp,
          level: profile.level,
          avatar: profile.avatar,
          frame: profile.frame,
          title: profile.title,
          stats: {
            totalMatches: profile.totalMatches,
            wins: profile.wins,
            losses: profile.losses,
            draws: profile.draws,
            winStreak: profile.winStreak,
            bestStreak: profile.bestStreak,
            accuracy: profile.totalAnswered > 0 ? Math.round((profile.totalCorrect / profile.totalAnswered) * 100) : 0,
            recordModeBest: profile.recordModeBest,
          },
          dailyReward: {
            canClaim: canClaimDaily,
            streak: profile.dailyStreak,
          },
          hintPrices: config.hintPrices,
        },
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * دریافت جایزه ورود روزانه (Daily Reward)
   */
  static async claimDailyReward(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id?.toString()
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const profile = await QuizGameEngineService.getOrCreateProfile(userId)
      const today = new Date().toISOString().split('T')[0]
      const lastClaimStr = profile.lastDailyClaim ? new Date(profile.lastDailyClaim).toISOString().split('T')[0] : null

      if (lastClaimStr === today) {
        return res.status(400).json({ success: false, message: 'جایزه روزانه امروز را قبلاً دریافت کرده‌اید' })
      }

      // محاسبه تداوم روزها
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split('T')[0]
      if (lastClaimStr === yesterday) {
        profile.dailyStreak += 1
      } else {
        profile.dailyStreak = 1
      }

      const rewardCoins = 20 + Math.min(profile.dailyStreak * 10, 80)
      profile.coins += rewardCoins
      profile.lastDailyClaim = new Date()
      await profile.save()

      await CoinTransaction.create({
        userId,
        amount: rewardCoins,
        balanceAfter: profile.coins,
        type: 'daily_reward',
        idempotencyKey: `daily_reward_${userId}_${today}`,
        description: `پاداش ورود روز ${profile.dailyStreak}`,
      })

      res.json({
        success: true,
        data: {
          coinsAwarded: rewardCoins,
          currentCoins: profile.coins,
          dailyStreak: profile.dailyStreak,
        },
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * ورود به صف مچ‌میکینگ
   */
  static async joinMatchmaking(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id?.toString()
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const { mode, category } = req.body
      const result = await QuizGameEngineService.joinMatchmaking(userId, mode, category)
      res.json({ success: true, data: result })
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message })
    }
  }

  /**
   * استعلام وضعیت صف (پولینگ تا ۱۰ ثانیه)
   */
  static async pollMatchmaking(req: AuthRequest, res: Response) {
    try {
      const ticketId = req.params.ticketId as string
      const result = await QuizGameEngineService.pollMatchmaking(ticketId)
      res.json({ success: true, data: result })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * لغو صف مچ‌میکینگ
   */
  static async cancelMatchmaking(req: AuthRequest, res: Response) {
    try {
      const { ticketId } = req.body
      QuizGameEngineService.cancelMatchmaking(ticketId)
      res.json({ success: true, message: 'صف با موفقیت لغو شد' })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * دریافت اطلاعات زنده بازی
   */
  static async getMatch(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id?.toString(); if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' });
      const matchId = req.params.matchId as string
      const match = await (await import('../../../core/models/QuizMatch.js')).QuizMatch.findOne({ matchId })
      if (!match) return res.status(404).json({ success: false, message: 'بازی یافت نشد' })

      const sanitized = QuizGameEngineService.sanitizeMatchForClient(match, userId)
      res.json({ success: true, data: sanitized })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * ثبت پاسخ کاربر در مچ
   */
  static async submitAnswer(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id?.toString(); if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' });
      const matchId = req.params.matchId as string
      const { questionIndex, selectedOption, responseTimeMs } = req.body

      const result = await QuizGameEngineService.submitAnswer(
        matchId,
        userId,
        Number(questionIndex),
        selectedOption,
        Number(responseTimeMs) || 5000
      )
      res.json({ success: true, data: result })
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message })
    }
  }

  /**
   * استفاده از راهنما (Hint)
   */
  static async useHint(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id?.toString(); if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' });
      const matchId = req.params.matchId as string
      const { hintType } = req.body

      const result = await QuizGameEngineService.useHint(matchId, userId, hintType)
      res.json({ success: true, data: result })
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message })
    }
  }

  /**
   * پایان بازی و دریافت پاداش‌ها
   */
  static async finishMatch(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id?.toString(); if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' });
      const matchId = req.params.matchId as string

      const result = await QuizGameEngineService.finishMatchAndReward(matchId, userId)
      res.json({ success: true, data: result })
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message })
    }
  }

  /**
   * جدول رده‌بندی بدون لیگ
   */
  static async getLeaderboard(req: AuthRequest, res: Response) {
    try {
      const type = (req.query.type as 'global' | 'friends' | 'class') || 'global'
      const leaderboard = await QuizGameEngineService.getLeaderboard(type, req.user?._id?.toString())
      res.json({ success: true, data: leaderboard })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * لیست ماموریت‌ها و وضعیت پیشرفت
   */
  static async getMissions(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id?.toString()
      const today = new Date().toISOString().split('T')[0]
      let missions = await QuizMission.find({ isActive: true })

      if (missions.length === 0) {
        // ایجاد ماموریت‌های پیش‌فرض در صورت عدم وجود
        missions = await QuizMission.create([
          {
            missionId: 'daily_win_2',
            title: 'فاتح رقابت‌ها',
            description: 'در ۲ بازی برنده شوید',
            type: 'daily',
            targetType: 'win_matches',
            targetValue: 2,
            coinReward: 50,
            xpReward: 80,
          },
          {
            missionId: 'daily_correct_6',
            title: 'دقت طلایی',
            description: 'به ۶ سوال پاسخ صحیح بدهید',
            type: 'daily',
            targetType: 'correct_answers',
            targetValue: 6,
            coinReward: 40,
            xpReward: 60,
          },
          {
            missionId: 'daily_play_3',
            title: 'همیشه در صحنه',
            description: 'در ۳ مسابقه کوییز شرکت کنید',
            type: 'daily',
            targetType: 'play_matches',
            targetValue: 3,
            coinReward: 30,
            xpReward: 50,
          },
        ])
      }

      const progressList = await StudentMissionProgress.find({ userId, cycleDate: today })
      const progressMap = new Map(progressList.map(p => [p.missionId, p]))

      const result = missions.map(m => {
        const prog = progressMap.get(m.missionId)
        return {
          missionId: m.missionId,
          title: m.title,
          description: m.description,
          type: m.type,
          targetValue: m.targetValue,
          currentValue: prog?.currentValue || 0,
          isCompleted: prog?.isCompleted || false,
          isClaimed: prog?.isClaimed || false,
          coinReward: m.coinReward,
          xpReward: m.xpReward,
        }
      })

      res.json({ success: true, data: result })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * دریافت جایزه ماموریت تکمیل شده
   */
  static async claimMissionReward(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id?.toString(); if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' });
      const missionId = req.params.missionId as string
      const today = new Date().toISOString().split('T')[0]

      const progress = await StudentMissionProgress.findOne({ userId, missionId, cycleDate: today })
      if (!progress || !progress.isCompleted) {
        return res.status(400).json({ success: false, message: 'این ماموریت هنوز تکمیل نشده است' })
      }
      if (progress.isClaimed) {
        return res.status(400).json({ success: false, message: 'پاداش این ماموریت قبلاً دریافت شده است' })
      }

      const mission = await QuizMission.findOne({ missionId })
      if (!mission) return res.status(404).json({ success: false, message: 'ماموریت یافت نشد' })

      const profile = await QuizGameEngineService.getOrCreateProfile(userId)
      profile.coins += mission.coinReward
      profile.xp += mission.xpReward
      await profile.save()

      progress.isClaimed = true
      await progress.save()

      await CoinTransaction.create({
        userId,
        amount: mission.coinReward,
        balanceAfter: profile.coins,
        type: 'mission_reward',
        idempotencyKey: `mission_reward_${userId}_${missionId}_${today}`,
        description: `پاداش ماموریت: ${mission.title}`,
      })

      res.json({
        success: true,
        data: {
          coinsAwarded: mission.coinReward,
          xpAwarded: mission.xpReward,
          currentCoins: profile.coins,
          currentXp: profile.xp,
        },
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * فروشگاه کوییز نوکیتا
   */
  static async getStore(req: AuthRequest, res: Response) {
    const items = [
      { id: 'avatar_scout', name: 'آواتار کاشف علم', type: 'avatar', price: 150, icon: 'Compass' },
      { id: 'avatar_wizard', name: 'آواتار جادوگر فرمول‌ها', type: 'avatar', price: 250, icon: 'Sparkles' },
      { id: 'avatar_champion', name: 'آواتار قهرمان مدرسه', type: 'avatar', price: 400, icon: 'Trophy' },
      { id: 'frame_gold', name: 'کادر طلایی درخشان', type: 'frame', price: 200, icon: 'Shield' },
      { id: 'frame_neon', name: 'کادر نئونی سایبر', type: 'frame', price: 300, icon: 'Flame' },
      { id: 'bundle_hints', name: 'بسته ۵ تایی راهنمای حذف دو گزینه', type: 'hint_bundle', price: 80, icon: 'HelpCircle' },
    ]
    res.json({ success: true, data: items })
  }

  /**
   * خرید آیتم از فروشگاه با سکه
   */
  static async buyStoreItem(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id?.toString(); if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' });
      const { itemId } = req.body

      const storeCatalog: Record<string, { price: number; type: any; name: string }> = {
        avatar_scout: { price: 150, type: 'avatar', name: 'آواتار کاشف علم' },
        avatar_wizard: { price: 250, type: 'avatar', name: 'آواتار جادوگر فرمول‌ها' },
        avatar_champion: { price: 400, type: 'avatar', name: 'آواتار قهرمان مدرسه' },
        frame_gold: { price: 200, type: 'frame', name: 'کادر طلایی درخشان' },
        frame_neon: { price: 300, type: 'frame', name: 'کادر نئونی سایبر' },
        bundle_hints: { price: 80, type: 'hint_bundle', name: 'بسته راهنمای ۵تایی' },
      }

      const item = storeCatalog[itemId]
      if (!item) return res.status(404).json({ success: false, message: 'آیتم مورد نظر در فروشگاه یافت نشد' })

      const profile = await QuizGameEngineService.getOrCreateProfile(userId)
      if (profile.coins < item.price) {
        return res.status(400).json({ success: false, message: 'سکه کافی ندارید' })
      }

      // کسر سکه و افزودن به موجودی
      profile.coins -= item.price
      if (item.type === 'avatar') profile.avatar = itemId
      if (item.type === 'frame') profile.frame = itemId
      profile.inventory.push({ itemId, itemType: item.type, purchasedAt: new Date() })
      await profile.save()

      await CoinTransaction.create({
        userId,
        amount: -item.price,
        balanceAfter: profile.coins,
        type: 'store_purchase',
        idempotencyKey: `store_purchase_${userId}_${itemId}_${uuidv4()}`,
        description: `خرید ${item.name}`,
      })

      res.json({ success: true, data: { remainingCoins: profile.coins, activeAvatar: profile.avatar } })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * حالت رکورد انفرادی (Record Mode)
   */
  static async startRecordMode(req: AuthRequest, res: Response) {
    try {
      // انتخاب ۱۰ سوال رندوم تستی
      const rawQuestions = await Question.aggregate([
        { $match: { type: 'تستی', options: { $exists: true, $not: { $size: 0 } } } },
        { $sample: { size: 15 } },
      ])

      const cleanQuestions = rawQuestions.map((q, idx) => ({
        index: idx,
        questionId: q._id,
        text: q.question.replace(/<[^>]*>?/gm, '').trim(),
        options: (q.options || []).map((o: string) => o.replace(/<[^>]*>?/gm, '').trim()),
        difficulty: q.difficulty || 'متوسط',
      }))

      res.json({
        success: true,
        data: {
          sessionToken: `record_${uuidv4()}`,
          questions: cleanQuestions,
        },
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * پایان حالت رکورد و ثبت بهترین امتیاز
   */
  static async finishRecordMode(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id?.toString(); if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' });
      const { score, streak } = req.body

      const profile = await QuizGameEngineService.getOrCreateProfile(userId)
      const earnedCoins = Math.min(Math.floor(Number(score) / 2), 50)
      const earnedXp = Math.min(Number(score), 100)

      profile.coins += earnedCoins
      profile.xp += earnedXp
      if (Number(streak) > profile.recordModeBest) {
        profile.recordModeBest = Number(streak)
      }
      await profile.save()

      if (earnedCoins > 0) {
        await CoinTransaction.create({
          userId,
          amount: earnedCoins,
          balanceAfter: profile.coins,
          type: 'record_reward',
          idempotencyKey: `record_reward_${userId}_${uuidv4()}`,
          description: `پاداش حالت رکورد انفرادی`,
        })
      }

      res.json({
        success: true,
        data: {
          earnedCoins,
          earnedXp,
          personalBest: profile.recordModeBest,
          currentCoins: profile.coins,
        },
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }
}
