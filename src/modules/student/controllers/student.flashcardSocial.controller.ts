import { Response } from 'express'
import crypto from 'crypto'
import { AuthRequest } from '../../../core/middleware/auth.js'
import { FlashcardDeck } from '../../../core/models/FlashcardDeck.js'
import { FlashcardCard } from '../../../core/models/FlashcardCard.js'
import { FlashcardProfile } from '../../../core/models/FlashcardProfile.js'
import { FlashcardChallenge } from '../../../core/models/FlashcardChallenge.js'

const MIN_CARDS_TO_SHARE = 15

function makeShortCode(prefix = ''): string {
  const token = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase()
  return prefix ? `${prefix}-${token}` : token
}

export class StudentFlashcardSocialController {
  /**
   * اشتراک‌گذاری رایگان دسته (با قفل کیفی حداقل ۱۵ کارت معتبر و غیرتکراری)
   */
  static async shareDeck(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const { deckClientId, isPublic = true, enableCollab = false } = req.body || {}
      if (!deckClientId) {
        return res.status(400).json({ success: false, message: 'شناسه دسته ارسال نشده است' })
      }

      const deck = await FlashcardDeck.findOne({ userId, clientId: String(deckClientId), isDeleted: false })
      if (!deck) {
        return res.status(404).json({ success: false, message: 'دسته ابتدا باید با سرور همگام‌سازی شود' })
      }

      const cards = await FlashcardCard.find({
        userId,
        deckClientId: String(deckClientId),
        isDeleted: false,
      }).lean()

      const uniquePairs = new Set<string>()
      for (const c of cards) {
        const f = (c.frontText || '').trim().toLowerCase()
        const b = (c.backShortAnswer || '').trim().toLowerCase()
        if (f && b && f !== b) {
          uniquePairs.add(`${f}::${b}`)
        }
      }

      if (uniquePairs.size < MIN_CARDS_TO_SHARE) {
        return res.status(400).json({
          success: false,
          message: `برای اشتراک‌گذاری و حفظ کیفیت، دسته باید حداقل ${MIN_CARDS_TO_SHARE} کارت معتبر و غیرتکراری داشته باشد (اکنون ${uniquePairs.size} کارت معتبر دارد).`,
        })
      }

      if (!deck.shareCode) deck.shareCode = makeShortCode('FC')
      if (enableCollab && !deck.collabCode) deck.collabCode = makeShortCode('CO')
      deck.isPublic = Boolean(isPublic)
      deck.updatedAtMs = Date.now()
      await deck.save()

      // اعطای نشان اولین اشتراک‌گذاری
      await FlashcardProfile.findOneAndUpdate(
        { userId },
        { $addToSet: { badges: 'first_share' } },
        { upsert: true }
      )

      res.json({
        success: true,
        data: {
          shareCode: deck.shareCode,
          collabCode: deck.collabCode,
          isPublic: deck.isPublic,
          shareUrl: `nokita://flashcards/import?code=${deck.shareCode}`,
        },
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * مرور کتابخانه رایگان دسته‌های اشتراکی
   */
  static async browseSharedDecks(req: AuthRequest, res: Response) {
    try {
      const { grade, subject, q, sort = 'popular' } = req.query
      const filter: Record<string, any> = {
        isPublic: true,
        isDeleted: false,
        isHiddenByReport: { $ne: true },
        shareCode: { $exists: true, $ne: null },
      }
      if (grade) filter.grade = String(grade)
      if (subject) filter.subject = String(subject)
      if (q) {
        const safeRegex = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        filter.$or = [{ title: safeRegex }, { chapter: safeRegex }, { tags: safeRegex }]
      }

      const sortSpec: Record<string, 1 | -1> =
        sort === 'rating'
          ? { ratingSum: -1, ratingCount: -1 }
          : sort === 'recent'
          ? { updatedAtMs: -1 }
          : { usageCount: -1, updatedAtMs: -1 }

      const decks = await FlashcardDeck.find(filter)
        .sort(sortSpec)
        .limit(40)
        .populate('userId', 'fullName avatar')
        .lean()

      const enriched = await Promise.all(
        decks.map(async (d: any) => {
          const cardsCount = await FlashcardCard.countDocuments({
            userId: d.userId?._id || d.userId,
            deckClientId: d.clientId,
            isDeleted: false,
          })
          return {
            shareCode: d.shareCode,
            title: d.title,
            description: d.description,
            grade: d.grade,
            subject: d.subject,
            chapter: d.chapter,
            icon: d.icon,
            color: d.color,
            tags: d.tags || [],
            cardsCount,
            usageCount: d.usageCount || 0,
            avgRating: d.ratingCount > 0 ? Number((d.ratingSum / d.ratingCount).toFixed(1)) : 0,
            ratingCount: d.ratingCount || 0,
            authorName: d.userId?.fullName || 'دانش‌آموز نوکیتا',
          }
        })
      )

      res.json({ success: true, data: enriched })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * دریافت و کلون کردن دسته با کد اشتراک یا لینک همکاری مشترک
   */
  static async cloneSharedDeck(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const code = String(req.params.code || '').trim().toUpperCase()
      const deck: any = await FlashcardDeck.findOne({
        isDeleted: false,
        isHiddenByReport: { $ne: true },
        $or: [{ shareCode: code }, { collabCode: code }],
      }).populate('userId', 'fullName')

      if (!deck) {
        return res.status(404).json({ success: false, message: 'دسته‌ای با این کد پیدا نشد' })
      }

      const isCollabAccess = deck.collabCode === code
      if (isCollabAccess) {
        await FlashcardDeck.updateOne(
          { _id: deck._id },
          { $addToSet: { collaborators: userId } }
        )
      }

      const ownerId = deck.userId?._id || deck.userId
      const cards = await FlashcardCard.find({
        userId: ownerId,
        deckClientId: deck.clientId,
        isDeleted: false,
      }).lean()

      if (String(ownerId) !== String(userId)) {
        await FlashcardDeck.updateOne({ _id: deck._id }, { $inc: { usageCount: 1 } })
        await FlashcardProfile.findOneAndUpdate(
          { userId: ownerId },
          { $inc: { xp: 5, weeklyXp: 5 } },
          { upsert: true }
        )
      }

      res.json({
        success: true,
        data: {
          isCollabAccess,
          collabCode: isCollabAccess ? deck.collabCode : undefined,
          deck: {
            title: deck.title,
            description: deck.description,
            grade: deck.grade,
            subject: deck.subject,
            chapter: deck.chapter,
            icon: deck.icon,
            color: deck.color,
            tags: deck.tags || [],
            authorName: deck.userId?.fullName || 'دانش‌آموز',
          },
          cards: cards.map((c: any) => ({
            cardType: c.cardType,
            frontText: c.frontText,
            backShortAnswer: c.backShortAnswer,
            backTip: c.backTip,
            textbookRef: c.textbookRef,
            options: c.options || [],
            correctOptionIndex: c.correctOptionIndex,
            tags: c.tags || [],
          })),
        },
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * افزودن کارت به یک دسته مشترک از طریق لینک همکاری
   */
  static async contributeCollabCards(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const code = String(req.params.code || '').trim().toUpperCase()
      const { cards = [] } = req.body || {}
      const deck = await FlashcardDeck.findOne({ collabCode: code, isDeleted: false })
      if (!deck) {
        return res.status(404).json({ success: false, message: 'لینک همکاری معتبر نیست' })
      }

      const validCards = (Array.isArray(cards) ? cards : []).filter(
        (c: any) => c?.frontText && c?.backShortAnswer
      )
      if (validCards.length === 0) {
        return res.status(400).json({ success: false, message: 'کارت معتبری ارسال نشد' })
      }

      const now = Date.now()
      const ops = validCards.slice(0, 50).map((c: any, idx: number) => ({
        updateOne: {
          filter: {
            userId: deck.userId,
            clientId: String(c.clientId || `collab_${now}_${idx}`),
          },
          update: {
            $set: {
              deckClientId: deck.clientId,
              cardType: ['basic', 'cloze', 'mcq', 'image', 'audio'].includes(c.cardType) ? c.cardType : 'basic',
              frontText: String(c.frontText).slice(0, 2000),
              backShortAnswer: String(c.backShortAnswer).slice(0, 2000),
              backTip: c.backTip ? String(c.backTip).slice(0, 1000) : '',
              tags: Array.isArray(c.tags) ? c.tags.map(String) : ['همکاری'],
              updatedAtMs: now,
            },
            $setOnInsert: {
              userId: deck.userId,
              clientId: String(c.clientId || `collab_${now}_${idx}`),
              ease: 2.5,
              intervalDays: 0,
              dueAt: now,
              repetitions: 0,
              lapses: 0,
            },
          },
          upsert: true,
        },
      }))

      await FlashcardCard.bulkWrite(ops)
      await FlashcardDeck.updateOne(
        { _id: deck._id },
        { $addToSet: { collaborators: userId }, $set: { updatedAtMs: now } }
      )
      res.json({ success: true, addedCount: ops.length })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * امتیازدهی ۱ تا ۵ ستاره به دسته اشتراکی
   */
  static async rateSharedDeck(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const code = String(req.params.code || '').trim().toUpperCase()
      const rating = Math.min(5, Math.max(1, Math.round(Number(req.body?.rating || 5))))

      const deck = await FlashcardDeck.findOne({ shareCode: code, isDeleted: false })
      if (!deck) return res.status(404).json({ success: false, message: 'دسته پیدا نشد' })

      const existingIdx = (deck.ratedBy || []).findIndex(
        (r) => String(r.userId) === String(userId)
      )
      if (existingIdx >= 0) {
        deck.ratedBy[existingIdx].rating = rating
      } else {
        deck.ratedBy.push({ userId: userId as any, rating })
      }
      deck.ratingCount = deck.ratedBy.length
      deck.ratingSum = deck.ratedBy.reduce((sum, r) => sum + r.rating, 0)
      await deck.save()

      res.json({
        success: true,
        avgRating: Number((deck.ratingSum / Math.max(1, deck.ratingCount)).toFixed(1)),
        ratingCount: deck.ratingCount,
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * گزارش محتوای نادرست یا نامناسب (مخفی‌سازی خودکار پس از ۳ گزارش)
   */
  static async reportSharedDeck(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const code = String(req.params.code || '').trim().toUpperCase()
      const deck = await FlashcardDeck.findOne({ shareCode: code, isDeleted: false })
      if (!deck) return res.status(404).json({ success: false, message: 'دسته پیدا نشد' })

      const already = (deck.reportedBy || []).some((id) => String(id) === String(userId))
      if (!already) {
        deck.reportedBy.push(userId as any)
        deck.reportCount = deck.reportedBy.length
        if (deck.reportCount >= 3) {
          deck.isHiddenByReport = true
        }
        await deck.save()
      }

      res.json({ success: true, message: 'گزارش شما با تشکر ثبت شد و بررسی می‌شود.' })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * جدول لیگ هفتگی بر اساس XP هفتگی
   */
  static async getWeeklyLeague(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id
      const topProfiles = await FlashcardProfile.find()
        .sort({ weeklyXp: -1, xp: -1 })
        .limit(30)
        .populate('userId', 'fullName avatar')
        .lean()

      const rows = topProfiles.map((p: any, idx: number) => ({
        rank: idx + 1,
        userId: String(p.userId?._id || p.userId),
        name: p.userId?.fullName || 'دانش‌آموز نوکیتا',
        avatar: p.userId?.avatar || '',
        weeklyXp: p.weeklyXp || 0,
        xp: p.xp || 0,
        level: p.level || 1,
        currentStreak: p.currentStreak || 0,
        isMe: userId ? String(p.userId?._id || p.userId) === String(userId) : false,
      }))

      let myRank = rows.find((r) => r.isMe)?.rank || 0
      if (!myRank && userId) {
        const me = await FlashcardProfile.findOne({ userId }).lean()
        if (me) {
          const higher = await FlashcardProfile.countDocuments({
            weeklyXp: { $gt: me.weeklyXp || 0 },
          })
          myRank = higher + 1
        }
      }

      res.json({ success: true, data: { entries: rows, myRank } })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * ساخت چالش دوستانه (دوئل) با امتیاز اولیه سازنده
   */
  static async createChallenge(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const { deckTitle, questions, creatorScore, creatorTimeMs } = req.body || {}
      if (!Array.isArray(questions) || questions.length < 2) {
        return res.status(400).json({ success: false, message: 'چالش حداقل باید ۲ سؤال داشته باشد' })
      }

      const code = makeShortCode('DUEL')
      const challenge = await FlashcardChallenge.create({
        code,
        deckTitle: String(deckTitle || 'چالش فلش‌کارت').slice(0, 120),
        creatorId: userId,
        creatorName: req.user?.fullName || 'شما',
        creatorScore: Math.max(0, Number(creatorScore || 0)),
        creatorTimeMs: Math.max(500, Number(creatorTimeMs || 10000)),
        questions: questions.slice(0, 10),
        status: 'open',
      })

      res.json({ success: true, data: challenge })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * دریافت لیست چالش‌های من یا پیدا کردن چالش با کد
   */
  static async listChallenges(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const items = await FlashcardChallenge.find({
        $or: [{ creatorId: userId }, { opponentId: userId }],
      })
        .sort({ createdAt: -1 })
        .limit(25)
        .lean()

      res.json({ success: true, data: items })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  static async getChallengeByCode(req: AuthRequest, res: Response) {
    try {
      const code = String(req.params.code || '').trim().toUpperCase()
      const item = await FlashcardChallenge.findOne({ code }).lean()
      if (!item) return res.status(404).json({ success: false, message: 'چالشی با این کد پیدا نشد' })
      res.json({ success: true, data: item })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  static async submitChallenge(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const code = String(req.params.code || '').trim().toUpperCase()
      const { score = 0, timeMs = 15000 } = req.body || {}
      const challenge = await FlashcardChallenge.findOne({ code })
      if (!challenge) return res.status(404).json({ success: false, message: 'چالش پیدا نشد' })
      if (String(challenge.creatorId) === String(userId)) {
        return res.status(400).json({ success: false, message: 'نمی‌توانید مقابل خودتان رقابت کنید' })
      }
      if (challenge.status === 'completed') {
        return res.status(400).json({ success: false, message: 'این چالش قبلاً به پایان رسیده است' })
      }

      challenge.opponentId = userId as any
      challenge.opponentName = req.user?.fullName || 'حریف'
      challenge.opponentScore = Math.max(0, Number(score))
      challenge.opponentTimeMs = Math.max(500, Number(timeMs))
      challenge.status = 'completed'

      const oppWon =
        challenge.opponentScore > challenge.creatorScore ||
        (challenge.opponentScore === challenge.creatorScore &&
          challenge.opponentTimeMs < challenge.creatorTimeMs)
      challenge.winnerId = oppWon ? (userId as any) : challenge.creatorId
      await challenge.save()

      const winnerBonus = 25
      await FlashcardProfile.findOneAndUpdate(
        { userId: challenge.winnerId },
        { $inc: { xp: winnerBonus, weeklyXp: winnerBonus } },
        { upsert: true }
      )

      res.json({ success: true, data: challenge })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }
}
