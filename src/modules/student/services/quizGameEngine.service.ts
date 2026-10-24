import { Types } from 'mongoose'
import { v4 as uuidv4 } from 'uuid'
import { QuizProfile, IQuizProfile } from '../../../core/models/QuizProfile.js'
import { QuizMatch, IQuizMatch, IQuizPlayerState } from '../../../core/models/QuizMatch.js'
import { QuizConfig, IQuizConfig } from '../../../core/models/QuizConfig.js'
import { CoinTransaction } from '../../../core/models/CoinTransaction.js'
import { Question } from '../../../core/models/Question.js'
import { User } from '../../../core/models/User.js'
import { StudentProfile } from '../../../core/models/StudentProfile.js'
import { QuizMission, StudentMissionProgress } from '../../../core/models/QuizMission.js'

// ربات‌های پیش‌فرض آموزشی نوکیتا
export const BOT_ROSTER = [
  { id: 'bot_aria', name: 'آریا رادمنش', avatar: 'avatar_bot_1', difficulty: 'easy' as const },
  { id: 'bot_sara', name: 'سارا تهرانی', avatar: 'avatar_bot_2', difficulty: 'easy' as const },
  { id: 'bot_nima', name: 'نیما سعیدی', avatar: 'avatar_bot_3', difficulty: 'easy' as const },
  { id: 'bot_fatemeh', name: 'فاطمه احمدی', avatar: 'avatar_bot_4', difficulty: 'easy' as const },
  { id: 'bot_parsa', name: 'پارسا کریمی', avatar: 'avatar_bot_5', difficulty: 'medium' as const },
  { id: 'bot_yasna', name: 'یسنا محمدی', avatar: 'avatar_bot_6', difficulty: 'medium' as const },
  { id: 'bot_amir', name: 'امیرحسین زارعی', avatar: 'avatar_bot_7', difficulty: 'medium' as const },
  { id: 'bot_soheila', name: 'سهیلا رستمی', avatar: 'avatar_bot_8', difficulty: 'hard' as const },
  { id: 'bot_danial', name: 'دانیال مهدوی', avatar: 'avatar_bot_9', difficulty: 'hard' as const },
]

export interface MatchmakingQueueEntry {
  ticketId: string
  userId: string
  username: string
  fullName: string
  avatar: string
  mode: 'quick' | 'category' | 'friend' | 'class'
  category?: string
  joinedAt: number
}

// صف زنده مچ‌میکینگ در حافظه
const matchmakingQueue: Map<string, MatchmakingQueueEntry> = new Map()

export class QuizGameEngineService {
  /**
   * دریافت یا ایجاد تنظیمات عمومی بازی
   */
  static async getConfig(): Promise<IQuizConfig> {
    let config = await QuizConfig.findOne({ key: 'global' })
    if (!config) {
      config = await QuizConfig.create({ key: 'global' })
    }
    return config
  }

  /**
   * دریافت یا ساخت پروفایل کوییز دانش‌آموز همراه با بازسازی خودکار قلب‌ها
   */
  static async getOrCreateProfile(userId: string | Types.ObjectId): Promise<IQuizProfile> {
    const config = await this.getConfig()
    let profile = await QuizProfile.findOne({ user: userId })

    if (!profile) {
      const user = await User.findById(userId)
      const student = await StudentProfile.findOne({ user: userId })
      profile = await QuizProfile.create({
        user: userId,
        studentCode: student?.studentCode || user?.username,
        coins: 200,
        hearts: config.maxHearts,
        lastHeartRegen: new Date(),
        xp: 0,
        level: 1,
        avatar: 'avatar_student_1',
      })
    } else {
      // محاسبه بازیابی قلب‌ها بر اساس زمان سپری شده
      const now = Date.now()
      const lastRegen = profile.lastHeartRegen ? new Date(profile.lastHeartRegen).getTime() : now
      const elapsedMinutes = (now - lastRegen) / (1000 * 60)
      const regenInterval = config.heartRegenMinutes || 60

      if (profile.hearts < config.maxHearts && elapsedMinutes >= regenInterval) {
        const heartsToAdd = Math.floor(elapsedMinutes / regenInterval)
        profile.hearts = Math.min(config.maxHearts, profile.hearts + heartsToAdd)
        profile.lastHeartRegen = new Date(lastRegen + heartsToAdd * regenInterval * 60 * 1000)
        await profile.save()
      }
    }

    return profile
  }

  /**
   * پیوستن به صف مچ‌میکینگ
   */
  static async joinMatchmaking(
    userId: string,
    mode: 'quick' | 'category' | 'friend' | 'class' = 'quick',
    category?: string
  ): Promise<{ ticketId: string; status: 'queued' | 'match_ready'; matchId?: string }> {
    const profile = await this.getOrCreateProfile(userId)
    if (profile.hearts <= 0) {
      throw new Error('قلب کافی برای شروع بازی ندارید! لطفاً صبر کنید تا شارژ شود.')
    }

    const user = await User.findById(userId)
    if (!user) throw new Error('کاربر یافت نشد')

    // بررسی آیا حریف انسانی دیگری در صف است
    const now = Date.now()
    let matchedOpponent: MatchmakingQueueEntry | null = null

    for (const [ticket, entry] of matchmakingQueue.entries()) {
      // حریف نباید خود کاربر باشد و باید در محدوده ۱۰ ثانیه باشد
      if (entry.userId !== userId && (now - entry.joinedAt) < 10000) {
        if (mode === 'quick' || entry.category === category) {
          matchedOpponent = entry
          matchmakingQueue.delete(ticket)
          break
        }
      }
    }

    if (matchedOpponent) {
      // کسر ۱ قلب از هر دو بازیکن
      profile.hearts = Math.max(0, profile.hearts - 1)
      await profile.save()

      const oppProfile = await this.getOrCreateProfile(matchedOpponent.userId)
      oppProfile.hearts = Math.max(0, oppProfile.hearts - 1)
      await oppProfile.save()

      // ایجاد مچ انسان در برابر انسان
      const match = await this.createMatch(
        {
          userId: new Types.ObjectId(userId),
          username: user.username,
          fullName: user.fullName || user.username,
          avatar: profile.avatar || 'avatar_student_1',
          score: 0,
          correctCount: 0,
          isBot: false,
          answers: [],
        },
        {
          userId: new Types.ObjectId(matchedOpponent.userId),
          username: matchedOpponent.username,
          fullName: matchedOpponent.fullName,
          avatar: matchedOpponent.avatar,
          score: 0,
          correctCount: 0,
          isBot: false,
          answers: [],
        },
        mode,
        category
      )

      return { ticketId: 'matched', status: 'match_ready', matchId: match.matchId }
    }

    // اگر حریفی نبود، ثبت در صف
    const ticketId = `ticket_${uuidv4()}`
    matchmakingQueue.set(ticketId, {
      ticketId,
      userId,
      username: user.username,
      fullName: user.fullName || user.username,
      avatar: profile.avatar || 'avatar_student_1',
      mode,
      category,
      joinedAt: now,
    })

    return { ticketId, status: 'queued' }
  }

  /**
   * بررسی وضعیت صف (پولینگ کلاینت تا ۱۰ ثانیه، در ۱۰ ثانیه ربات انتخاب می‌شود)
   */
  static async pollMatchmaking(ticketId: string): Promise<{ status: 'waiting' | 'match_ready' | 'expired'; matchId?: string }> {
    const entry = matchmakingQueue.get(ticketId)
    if (!entry) {
      return { status: 'expired' }
    }

    const elapsed = Date.now() - entry.joinedAt
    const config = await this.getConfig()
    const timeoutMs = (config.matchmakingTimeoutSeconds || 10) * 1000

    if (elapsed >= timeoutMs) {
      // تایم‌اوت ۱۰ ثانیه فرا رسید -> جفت‌سازی اتوماتیک با ربات
      matchmakingQueue.delete(ticketId)

      const profile = await this.getOrCreateProfile(entry.userId)
      profile.hearts = Math.max(0, profile.hearts - 1)
      await profile.save()

      // انتخاب ربات طبق توزیع تنظیمی ادمین (۷۰٪ ساده، ۲۵٪ متوسط، ۵٪ سخت)
      const bot = this.selectBot(config)

      const match = await this.createMatch(
        {
          userId: new Types.ObjectId(entry.userId),
          username: entry.username,
          fullName: entry.fullName,
          avatar: entry.avatar,
          score: 0,
          correctCount: 0,
          isBot: false,
          answers: [],
        },
        {
          username: bot.name,
          fullName: bot.name,
          avatar: bot.avatar,
          score: 0,
          correctCount: 0,
          isBot: true,
          botDifficulty: bot.difficulty,
          answers: [],
        },
        entry.mode,
        entry.category
      )

      return { status: 'match_ready', matchId: match.matchId }
    }

    return { status: 'waiting' }
  }

  /**
   * لغو صف مچ‌میکینگ
   */
  static cancelMatchmaking(ticketId: string): boolean {
    return matchmakingQueue.delete(ticketId)
  }

  /**
   * انتخاب ربات بر اساس توزیع شانس
   */
  private static selectBot(config: IQuizConfig) {
    const rand = Math.random() * 100
    const easyThreshold = config.botDistribution.easy
    const mediumThreshold = easyThreshold + config.botDistribution.medium

    let targetDiff: 'easy' | 'medium' | 'hard' = 'easy'
    if (rand >= mediumThreshold) {
      targetDiff = 'hard'
    } else if (rand >= easyThreshold) {
      targetDiff = 'medium'
    }

    const candidates = BOT_ROSTER.filter(b => b.difficulty === targetDiff)
    const selected = candidates[Math.floor(Math.random() * candidates.length)] || BOT_ROSTER[0]
    return selected
  }

  /**
   * پاکسازی تگ‌های HTML از متون سوال
   */
  private static cleanText(html: string): string {
    if (!html) return ''
    return html.replace(/<[^>]*>?/gm, '').trim()
  }

  /**
   * ایجاد مچ جدید و بارگذاری سوالات از پایگاه داده
   */
  static async createMatch(
    player1: IQuizPlayerState,
    player2: IQuizPlayerState,
    mode: 'quick' | 'category' | 'friend' | 'class',
    category?: string
  ): Promise<IQuizMatch> {
    const config = await this.getConfig()
    const rounds = config.roundsPerMatch || 2
    const questionsPerRound = config.questionsPerRound || 3
    const totalQuestions = rounds * questionsPerRound

    // بارگذاری سوالات از کالکشن Question
    const query: any = {
      type: 'تستی',
      options: { $exists: true, $not: { $size: 0 } },
    }

    let rawQuestions = await Question.aggregate([
      { $match: query },
      { $sample: { size: totalQuestions + 5 } },
    ])

    // اگر سوالات کافی نبودند یا گزینه‌ها کم بودند، فال‌بک سوالات آموزشی جامع
    const formattedQuestions = []
    for (const q of rawQuestions) {
      const cleanedText = this.cleanText(q.question)
      const options = (q.options || []).map((opt: string) => this.cleanText(opt)).filter(Boolean)
      const answer = this.cleanText(q.answer)

      if (cleanedText && options.length >= 4 && answer) {
        formattedQuestions.push({
          questionId: q._id,
          text: cleanedText,
          options: options.slice(0, 4),
          correctAnswer: answer,
          difficulty: q.difficulty || 'متوسط',
          category: category || 'عمومی',
          explanation: q.mainQuestion ? this.cleanText(q.mainQuestion) : '',
        })
      }
      if (formattedQuestions.length >= totalQuestions) break
    }

    // اگر تعداد سوالات از دیتابیس به حد نصاب نرسید، پر کردن با سوالات استاندارد آموزشی
    if (formattedQuestions.length < totalQuestions) {
      const fallbackPool: Array<{ text: string; options: string[]; correctAnswer: string; difficulty: 'ساده' | 'متوسط' | 'دشوار'; category: string }> = [
        {
          text: 'پایتخت ایران کدام شهر است؟',
          options: ['تهران', 'اصفهان', 'شیراز', 'مشهد'],
          correctAnswer: 'تهران',
          difficulty: 'ساده' as const,
          category: 'اطلاعات عمومی',
        },
        {
          text: 'حاصل ضرب عدد ۷ در ۸ کدام گزینه است؟',
          options: ['۵۴', '۵۶', '۴۸', '۶۴'],
          correctAnswer: '۵۶',
          difficulty: 'ساده' as const,
          category: 'ریاضی',
        },
        {
          text: 'کدام سیاره به سیاره سرخ معروف است؟',
          options: ['مریخ', 'زهره', 'مشتری', 'زحل'],
          correctAnswer: 'مریخ',
          difficulty: 'ساده' as const,
          category: 'علوم',
        },
        {
          text: 'شاعر کتاب شاهنامه کیست؟',
          options: ['فردوسی', 'سعدی', 'حافظ', 'مولانا'],
          correctAnswer: 'فردوسی',
          difficulty: 'ساده' as const,
          category: 'ادبیات',
        },
        {
          text: 'فرمول شیمیایی آب کدام است؟',
          options: ['H2O', 'CO2', 'NaCl', 'O2'],
          correctAnswer: 'H2O',
          difficulty: 'ساده' as const,
          category: 'علوم',
        },
        {
          text: 'کدام اندام اصلی‌ترین مرکز فرماندهی بدن انسان است؟',
          options: ['مغز', 'قلب', 'کبد', 'کلیه'],
          correctAnswer: 'مغز',
          difficulty: 'ساده' as const,
          category: 'علوم',
        },
      ]

      while (formattedQuestions.length < totalQuestions) {
        const item: { text: string; options: string[]; correctAnswer: string; difficulty: 'ساده' | 'متوسط' | 'دشوار'; category: string } = fallbackPool[formattedQuestions.length % fallbackPool.length]!
        formattedQuestions.push({
          questionId: new Types.ObjectId(),
          text: item.text,
          options: item.options,
          correctAnswer: item.correctAnswer,
          difficulty: item.difficulty,
          category: item.category,
          explanation: '',
        })
      }
    }

    const matchId = `match_${uuidv4()}`
    const match = await QuizMatch.create({
      matchId,
      mode,
      category: category || 'عمومی',
      status: 'in_progress',
      player1,
      player2,
      rounds,
      questionsPerRound,
      totalQuestions,
      currentQuestionIndex: 0,
      questions: formattedQuestions.slice(0, totalQuestions),
      currentQuestionStartedAt: new Date(),
    })

    return match
  }

  /**
   * دریافت حالت امن مچ برای کلاینت (پاسخ صحیح قبل از قفل سوال مخفی است)
   */
  static sanitizeMatchForClient(match: IQuizMatch, requestingUserId: string) {
    const isPlayer1 = match.player1.userId?.toString() === requestingUserId
    const currIdx = match.currentQuestionIndex
    const currentQ = match.questions[currIdx]

    // تعیین اینکه آیا کاربر جاری این سوال را پاسخ داده است یا خیر
    const userAnswers = isPlayer1 ? match.player1.answers : match.player2.answers
    const hasAnsweredCurrent = userAnswers.some(a => a.questionIndex === currIdx)

    return {
      matchId: match.matchId,
      mode: match.mode,
      category: match.category,
      status: match.status,
      rounds: match.rounds,
      questionsPerRound: match.questionsPerRound,
      totalQuestions: match.totalQuestions,
      currentQuestionIndex: currIdx,
      currentRound: Math.floor(currIdx / match.questionsPerRound) + 1,
      questionStartedAt: match.currentQuestionStartedAt,
      player1: {
        username: match.player1.username,
        fullName: match.player1.fullName,
        avatar: match.player1.avatar,
        score: match.player1.score,
        correctCount: match.player1.correctCount,
        hasAnsweredCurrent: match.player1.answers.some(a => a.questionIndex === currIdx),
      },
      player2: {
        username: match.player2.username,
        fullName: match.player2.fullName,
        avatar: match.player2.avatar,
        score: match.player2.score,
        correctCount: match.player2.correctCount,
        isBot: match.player2.isBot,
        hasAnsweredCurrent: match.player2.answers.some(a => a.questionIndex === currIdx),
      },
      currentQuestion: currentQ
        ? {
            index: currIdx,
            text: currentQ.text,
            options: currentQ.options,
            difficulty: currentQ.difficulty,
            category: currentQ.category,
            // اگر کاربر پاسخ داده، پاسخ صحیح و توضیح را فاش کن
            correctAnswer: hasAnsweredCurrent || match.status === 'completed' ? currentQ.correctAnswer : undefined,
            explanation: hasAnsweredCurrent || match.status === 'completed' ? currentQ.explanation : undefined,
          }
        : null,
      winner: match.winner,
      completedAt: match.completedAt,
    }
  }

  /**
   * ثبت پاسخ کاربر و اجرای هوش مصنوعی ربات در صورت بازی با ربات
   */
  static async submitAnswer(
    matchId: string,
    userId: string,
    questionIndex: number,
    selectedOption: string,
    responseTimeMs: number
  ) {
    const match = await QuizMatch.findOne({ matchId })
    if (!match) throw new Error('مچ پیدا نشد')
    if (match.status !== 'in_progress') throw new Error('این بازی فعال نیست')
    if (questionIndex !== match.currentQuestionIndex) {
      throw new Error('شاخص سوال با سوال فعال فعلی هماهنگ نیست')
    }

    const currentQ = match.questions[questionIndex]
    if (!currentQ) throw new Error('سوال یافت نشد')

    const isPlayer1 = match.player1.userId?.toString() === userId
    const isPlayer2 = match.player2.userId?.toString() === userId
    if (!isPlayer1 && !isPlayer2) throw new Error('شما عضو این بازی نیستید')

    const player = isPlayer1 ? match.player1 : match.player2
    const opponent = isPlayer1 ? match.player2 : match.player1

    // جلوگیری از ثبت پاسخ تکراری
    if (player.answers.some(a => a.questionIndex === questionIndex)) {
      return this.sanitizeMatchForClient(match, userId)
    }

    const isCorrect = selectedOption.trim() === currentQ.correctAnswer.trim()
    let pointsEarned = 0
    if (isCorrect) {
      // ۱۰۰ امتیاز پایه + تا ۵۰ امتیاز جایزه سرعت پاسخگویی
      const timeBonus = Math.max(0, Math.floor((15000 - Math.min(responseTimeMs, 15000)) / 300))
      pointsEarned = 100 + timeBonus
      player.score += pointsEarned
      player.correctCount += 1
    }

    player.answers.push({
      questionIndex,
      questionId: currentQ.questionId?.toString() || `${questionIndex}`,
      selectedOption,
      isCorrect,
      responseTimeMs,
      submittedAt: new Date(),
    })

    // اگر حریف ربات است، ربات نیز تصمیم‌گیری می‌کند
    if (opponent.isBot) {
      const botConfig = await this.getConfig()
      const botDifficulty = opponent.botDifficulty || 'easy'
      const accuracyTable = botConfig.botAccuracy[botDifficulty] || { easy: 0.8, medium: 0.3, hard: 0.05 }

      let diffKey: 'easy' | 'medium' | 'hard' = 'medium'
      if (currentQ.difficulty === 'ساده') diffKey = 'easy'
      else if (currentQ.difficulty === 'دشوار') diffKey = 'hard'

      const correctProb = accuracyTable[diffKey] ?? 0.5
      const botIsCorrect = Math.random() < correctProb

      let botOption = currentQ.correctAnswer
      if (!botIsCorrect) {
        const wrongOptions = currentQ.options.filter(o => o !== currentQ.correctAnswer)
        botOption = wrongOptions[Math.floor(Math.random() * wrongOptions.length)] || currentQ.options[0]
      }

      const delayRange = botConfig.botResponseDelay[botDifficulty] || { minMs: 3000, maxMs: 8000 }
      const botTime = Math.floor(Math.random() * (delayRange.maxMs - delayRange.minMs) + delayRange.minMs)
      let botPoints = 0
      if (botIsCorrect) {
        const botBonus = Math.max(0, Math.floor((15000 - Math.min(botTime, 15000)) / 300))
        botPoints = 100 + botBonus
        opponent.score += botPoints
        opponent.correctCount += 1
      }

      opponent.answers.push({
        questionIndex,
        questionId: currentQ.questionId?.toString() || `${questionIndex}`,
        selectedOption: botOption,
        isCorrect: botIsCorrect,
        responseTimeMs: botTime,
        submittedAt: new Date(),
      })
    }

    // بررسی اینکه آیا هر دو بازیکن پاسخ داده‌اند
    const bothAnswered =
      player.answers.some(a => a.questionIndex === questionIndex) &&
      opponent.answers.some(a => a.questionIndex === questionIndex)

    if (bothAnswered) {
      if (match.currentQuestionIndex + 1 < match.totalQuestions) {
        match.currentQuestionIndex += 1
        match.currentQuestionStartedAt = new Date()
      } else {
        // بازی تمام شد! تعیین برنده
        match.status = 'completed'
        match.completedAt = new Date()

        if (match.player1.score > match.player2.score) {
          match.winner = 'player1'
        } else if (match.player2.score > match.player1.score) {
          match.winner = 'player2'
        } else {
          match.winner = 'draw'
        }
      }
    }

    await match.save()
    return this.sanitizeMatchForClient(match, userId)
  }

  /**
   * استفاده از راهنما (Hint) همراه با کسر اتمیک سکه
   */
  static async useHint(matchId: string, userId: string, hintType: 'removeTwo' | 'extraTime' | 'audiencePoll' | 'learningHint') {
    const config = await this.getConfig()
    const price = config.hintPrices[hintType] || 20

    const profile = await this.getOrCreateProfile(userId)
    if (profile.coins < price) {
      throw new Error(`سکه کافی ندارید. هزینه این راهنما ${price} سکه است.`)
    }

    const match = await QuizMatch.findOne({ matchId })
    if (!match || match.status !== 'in_progress') throw new Error('بازی فعال نیست')

    const currentQ = match.questions[match.currentQuestionIndex]
    if (!currentQ) throw new Error('سوال جاری یافت نشد')

    // کسر اتمیک سکه در دیتابیس
    profile.coins -= price
    await profile.save()

    await CoinTransaction.create({
      userId,
      amount: -price,
      balanceAfter: profile.coins,
      type: 'hint_purchase',
      idempotencyKey: `hint_${matchId}_${match.currentQuestionIndex}_${hintType}_${uuidv4()}`,
      description: `استفاده از راهنمای ${hintType}`,
      referenceId: matchId,
    })

    // اجرای نوع راهنما
    if (hintType === 'removeTwo') {
      const wrongOptions = currentQ.options.filter(o => o.trim() !== currentQ.correctAnswer.trim())
      const toEliminate = wrongOptions.slice(0, 2)
      return { hintType, eliminatedOptions: toEliminate, remainingCoins: profile.coins }
    } else if (hintType === 'extraTime') {
      return { hintType, extraSeconds: 15, remainingCoins: profile.coins }
    } else if (hintType === 'audiencePoll') {
      // شبیه‌سازی نظرسنجی با درصد بیشتر برای پاسخ صحیح
      const distribution: Record<string, number> = {}
      const correctPercent = Math.floor(Math.random() * 25) + 55 // ۵۵ تا ۸۰ درصد
      let remainingPercent = 100 - correctPercent

      distribution[currentQ.correctAnswer] = correctPercent
      const wrongOptions = currentQ.options.filter(o => o !== currentQ.correctAnswer)

      wrongOptions.forEach((opt, idx) => {
        if (idx === wrongOptions.length - 1) {
          distribution[opt] = remainingPercent
        } else {
          const share = Math.floor(Math.random() * (remainingPercent / 2))
          distribution[opt] = share
          remainingPercent -= share
        }
      })
      return { hintType, pollResults: distribution, remainingCoins: profile.coins }
    } else if (hintType === 'learningHint') {
      return {
        hintType,
        hintText: currentQ.explanation || `نکته کلیدی: موضوع این سوال مربوط به مبحث «${currentQ.category}» است.`,
        remainingCoins: profile.coins,
      }
    }
  }

  /**
   * پایان رسمی بازی و اعطای جوایز اتمیک (سکه + XP) و به‌روزرسانی ماموریت‌ها
   */
  static async finishMatchAndReward(matchId: string, userId: string) {
    const match = await QuizMatch.findOne({ matchId })
    if (!match) throw new Error('بازی یافت نشد')

    const isPlayer1 = match.player1.userId?.toString() === userId
    const isPlayer2 = match.player2.userId?.toString() === userId
    if (!isPlayer1 && !isPlayer2) throw new Error('دسترسی غیرمجاز')

    const config = await this.getConfig()
    const alreadyRewarded = isPlayer1 ? match.player1RewardsGranted : match.player2RewardsGranted

    const isWinner =
      (isPlayer1 && match.winner === 'player1') ||
      (isPlayer2 && match.winner === 'player2')
    const isDraw = match.winner === 'draw'

    let earnedCoins = 0
    let earnedXp = 0

    if (!alreadyRewarded && match.status === 'completed') {
      if (isWinner) {
        earnedCoins = config.winCoinReward || 50
        earnedXp = config.winXpReward || 100
      } else if (isDraw) {
        earnedCoins = config.drawCoinReward || 20
        earnedXp = config.drawXpReward || 40
      } else {
        earnedCoins = config.lossCoinReward || 10
        earnedXp = config.lossXpReward || 20
      }

      const profile = await this.getOrCreateProfile(userId)
      profile.coins += earnedCoins
      profile.xp += earnedXp
      profile.totalMatches += 1

      if (isWinner) {
        profile.wins += 1
        profile.winStreak += 1
        if (profile.winStreak > profile.bestStreak) {
          profile.bestStreak = profile.winStreak
        }
      } else if (isDraw) {
        profile.draws += 1
        profile.winStreak = 0
      } else {
        profile.losses += 1
        profile.winStreak = 0
      }

      const playerAnswers = isPlayer1 ? match.player1.answers : match.player2.answers
      profile.totalAnswered += playerAnswers.length
      profile.totalCorrect += playerAnswers.filter(a => a.isCorrect).length

      // ارتقای لول بر اساس XP (هر ۲۰۰ امتیاز ۱ لول)
      const calculatedLevel = Math.floor(profile.xp / 200) + 1
      if (calculatedLevel > profile.level) {
        profile.level = calculatedLevel
      }

      await profile.save()

      // ثبت تراکنش در لجر سکه‌ها
      await CoinTransaction.create({
        userId,
        amount: earnedCoins,
        balanceAfter: profile.coins,
        type: 'match_reward',
        idempotencyKey: `match_reward_${matchId}_${userId}`,
        description: isWinner ? 'پاداش پیروزی در مسابقه' : isDraw ? 'پاداش مساوی در مسابقه' : 'پاداش تکمیل مسابقه',
        referenceId: matchId,
      })

      if (isPlayer1) match.player1RewardsGranted = true
      if (isPlayer2) match.player2RewardsGranted = true
      await match.save()

      // به‌روزرسانی ماموریت‌های روزانه
      await this.updateMissionsProgress(userId, isWinner, playerAnswers.filter(a => a.isCorrect).length)
    }

    const sanitized = this.sanitizeMatchForClient(match, userId)
    return {
      ...sanitized,
      rewards: {
        coins: earnedCoins,
        xp: earnedXp,
        isWinner,
        isDraw,
      },
    }
  }

  /**
   * به‌روزرسانی پیشرفت ماموریت‌های روزانه
   */
  private static async updateMissionsProgress(userId: string, isWinner: boolean, correctCount: number) {
    const today = new Date().toISOString().split('T')[0]
    const missions = await QuizMission.find({ isActive: true })

    for (const mission of missions) {
      let progress = await StudentMissionProgress.findOne({
        userId,
        missionId: mission.missionId,
        cycleDate: today,
      })

      if (!progress) {
        progress = new StudentMissionProgress({
          userId,
          missionId: mission.missionId,
          cycleDate: today,
          currentValue: 0,
        })
      }

      if (!progress.isCompleted) {
        if (mission.targetType === 'play_matches') {
          progress.currentValue += 1
        } else if (mission.targetType === 'win_matches' && isWinner) {
          progress.currentValue += 1
        } else if (mission.targetType === 'correct_answers') {
          progress.currentValue += correctCount
        }

        if (progress.currentValue >= mission.targetValue) {
          progress.isCompleted = true
        }
        await progress.save()
      }
    }
  }

  /**
   * دریافت جدول رده‌بندی مستقل (بدون لیگ)
   */
  static async getLeaderboard(type: 'global' | 'friends' | 'class', userId?: string) {
    if (type === 'global') {
      const topProfiles = await QuizProfile.find({ isRestricted: { $ne: true } })
        .sort({ xp: -1, wins: -1 })
        .limit(50)
        .populate('user', 'fullName username')

      return topProfiles.map((p, idx) => ({
        rank: idx + 1,
        userId: p.user?._id,
        fullName: (p.user as any)?.fullName || (p.user as any)?.username || 'دانش‌آموز نوکیتا',
        avatar: p.avatar,
        level: p.level,
        xp: p.xp,
        wins: p.wins,
        winStreak: p.winStreak,
      }))
    }

    // پیش‌فرض بازگشت تاپ گلوبال
    const profiles = await QuizProfile.find({ isRestricted: { $ne: true } })
      .sort({ xp: -1 })
      .limit(20)
      .populate('user', 'fullName username')

    return profiles.map((p, idx) => ({
      rank: idx + 1,
      userId: p.user?._id,
      fullName: (p.user as any)?.fullName || (p.user as any)?.username || 'دانش‌آموز نوکیتا',
      avatar: p.avatar,
      level: p.level,
      xp: p.xp,
      wins: p.wins,
      winStreak: p.winStreak,
    }))
  }
}
