import { Response } from 'express'
import { AuthRequest } from '../../../core/middleware/auth.js'
import { FlashcardDeck } from '../../../core/models/FlashcardDeck.js'
import { FlashcardCard } from '../../../core/models/FlashcardCard.js'
import { FlashcardReviewLog } from '../../../core/models/FlashcardReviewLog.js'
import { FlashcardProfile } from '../../../core/models/FlashcardProfile.js'

export class StudentFlashcardController {
  /**
   * دریافت تغییرات جدید سمت سرور از آخرین همگام‌سازی (Pull)
   */
  static async pullSync(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const since = Math.max(0, Number(req.query.since || 0))
      const limit = Math.min(500, Math.max(50, Number(req.query.limit || 500)))

      const [decks, cards, logs, profile] = await Promise.all([
        FlashcardDeck.find({ userId, updatedAtMs: { $gt: since } })
          .sort({ updatedAtMs: 1 })
          .limit(limit)
          .lean(),
        FlashcardCard.find({ userId, updatedAtMs: { $gt: since } })
          .sort({ updatedAtMs: 1 })
          .limit(limit)
          .lean(),
        FlashcardReviewLog.find({ userId, reviewedAt: { $gt: since } })
          .sort({ reviewedAt: 1 })
          .limit(limit)
          .lean(),
        FlashcardProfile.findOne({ userId }).lean(),
      ])

      res.json({
        success: true,
        data: {
          serverTime: Date.now(),
          decks,
          cards,
          logs,
          profile,
        },
      })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * ارسال تغییرات آفلاین دستگاه به سرور (Push Batch Sync)
   */
  static async pushSync(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id
      if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز نشده است' })

      const { decks = [], cards = [], logs = [], profile } = req.body || {}

      if (Array.isArray(decks) && decks.length > 0) {
        const deckOps = decks
          .filter((d: any) => d?.clientId && d?.title)
          .slice(0, 200)
          .map((d: any) => ({
            updateOne: {
              filter: { userId, clientId: String(d.clientId) },
              update: {
                $set: {
                  title: String(d.title).trim().slice(0, 120),
                  description: d.description ? String(d.description).slice(0, 400) : '',
                  grade: d.grade ? String(d.grade) : undefined,
                  subject: d.subject ? String(d.subject) : undefined,
                  chapter: d.chapter ? String(d.chapter) : undefined,
                  tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
                  icon: d.icon ? String(d.icon) : '🃏',
                  color: d.color ? String(d.color) : '#6366F1',
                  isPinned: Boolean(d.isPinned),
                  isArchived: Boolean(d.isArchived),
                  examDateMs: d.examDateMs ? Number(d.examDateMs) : undefined,
                  isDeleted: Boolean(d.isDeleted),
                  updatedAtMs: Number(d.updatedAtMs || Date.now()),
                },
                $setOnInsert: { userId, clientId: String(d.clientId) },
              },
              upsert: true,
            },
          }))
        if (deckOps.length > 0) await FlashcardDeck.bulkWrite(deckOps)
      }

      if (Array.isArray(cards) && cards.length > 0) {
        const cardOps = cards
          .filter((c: any) => c?.clientId && c?.deckClientId && c?.frontText && c?.backShortAnswer)
          .slice(0, 400)
          .map((c: any) => ({
            updateOne: {
              filter: { userId, clientId: String(c.clientId) },
              update: {
                $set: {
                  deckClientId: String(c.deckClientId),
                  cardType: ['basic', 'cloze', 'mcq', 'image', 'audio'].includes(c.cardType) ? c.cardType : 'basic',
                  frontText: String(c.frontText).slice(0, 2000),
                  backShortAnswer: String(c.backShortAnswer).slice(0, 2000),
                  backTip: c.backTip ? String(c.backTip).slice(0, 2000) : '',
                  textbookRef: c.textbookRef ? String(c.textbookRef).slice(0, 200) : '',
                  frontImage: c.frontImage ? String(c.frontImage) : undefined,
                  backImage: c.backImage ? String(c.backImage) : undefined,
                  audioPath: c.audioPath ? String(c.audioPath) : undefined,
                  options: Array.isArray(c.options) ? c.options.map(String) : [],
                  correctOptionIndex: typeof c.correctOptionIndex === 'number' ? c.correctOptionIndex : undefined,
                  tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
                  ease: Number(c.ease ?? 2.5),
                  intervalDays: Number(c.intervalDays ?? 0),
                  dueAt: Number(c.dueAt ?? Date.now()),
                  repetitions: Number(c.repetitions ?? 0),
                  lapses: Number(c.lapses ?? 0),
                  lastReviewedAt: c.lastReviewedAt ? Number(c.lastReviewedAt) : undefined,
                  isDeleted: Boolean(c.isDeleted),
                  updatedAtMs: Number(c.updatedAtMs || Date.now()),
                },
                $setOnInsert: { userId, clientId: String(c.clientId) },
              },
              upsert: true,
            },
          }))
        if (cardOps.length > 0) await FlashcardCard.bulkWrite(cardOps)
      }

      if (Array.isArray(logs) && logs.length > 0) {
        const logOps = logs
          .filter((l: any) => l?.clientId && l?.cardClientId && l?.deckClientId)
          .slice(0, 500)
          .map((l: any) => {
            const qNum = Number(l.quality)
            const quality = ([0, 1, 2, 3].includes(qNum) ? qNum : 2) as 0 | 1 | 2 | 3
            return {
              updateOne: {
                filter: { userId, clientId: String(l.clientId) },
                update: {
                  $setOnInsert: {
                    userId,
                    clientId: String(l.clientId),
                    cardClientId: String(l.cardClientId),
                    deckClientId: String(l.deckClientId),
                    quality,
                    elapsedMs: Number(l.elapsedMs || 0),
                    xpEarned: Math.min(50, Math.max(0, Number(l.xpEarned || 0))),
                    reviewedAt: Number(l.reviewedAt || Date.now()),
                  },
                },
                upsert: true,
              },
            }
          })
        if (logOps.length > 0) await FlashcardReviewLog.bulkWrite(logOps)
      }

      if (profile && typeof profile === 'object') {
        await FlashcardProfile.findOneAndUpdate(
          { userId },
          {
            $set: {
              dailyGoal: Math.min(200, Math.max(5, Number(profile.dailyGoal || 20))),
              newCardsLimit: Math.min(100, Math.max(1, Number(profile.newCardsLimit || 15))),
              currentStreak: Math.max(0, Number(profile.currentStreak || 0)),
              longestStreak: Math.max(0, Number(profile.longestStreak || 0)),
              lastStudyDate: profile.lastStudyDate ? String(profile.lastStudyDate) : undefined,
              xp: Math.max(0, Number(profile.xp || 0)),
              weeklyXp: Math.max(0, Number(profile.weeklyXp || 0)),
              level: Math.max(1, Number(profile.level || 1)),
              badges: Array.isArray(profile.badges) ? profile.badges.map(String) : [],
              preferredGrades: Array.isArray(profile.preferredGrades) ? profile.preferredGrades.map(String) : [],
              preferredSubjects: Array.isArray(profile.preferredSubjects) ? profile.preferredSubjects.map(String) : [],
              preferredStudyHour: Number(profile.preferredStudyHour ?? 19),
              darkMode: Boolean(profile.darkMode),
              dyslexiaFont: Boolean(profile.dyslexiaFont),
              fontScale: Number(profile.fontScale || 1),
              soundEnabled: profile.soundEnabled !== false,
              onboardingCompleted: Boolean(profile.onboardingCompleted),
              updatedAtMs: Number(profile.updatedAtMs || Date.now()),
            },
          },
          { upsert: true, new: true }
        )
      }

      res.json({ success: true, serverTime: Date.now() })
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message })
    }
  }
}
