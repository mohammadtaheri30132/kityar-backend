import { Router } from 'express'
import { protect, studentOnly } from '../../../core/middleware/auth.js'
import { StudentQuizController } from '../controllers/student.quiz.controller.js'

const router = Router()

// تمامی مسیرها با توکن احراز هویت دانش‌آموز محافظت می‌شوند
router.use(protect)
router.use(studentOnly)

// اطلاعات پروفایل، لول، سکه، قلب و ریکاوری
router.get('/profile', StudentQuizController.getProfile)
router.put('/profile', StudentQuizController.updateProfile)

// دریافت لیست ربات‌های تعریف‌شده از پنل
router.get('/bots', StudentQuizController.getBots)

// جایزه روزانه
router.post('/daily-reward/claim', StudentQuizController.claimDailyReward)

// مچ‌میکینگ و صف رقابتی
router.post('/matchmaking/join', StudentQuizController.joinMatchmaking)
router.get('/matchmaking/status/:ticketId', StudentQuizController.pollMatchmaking)
router.post('/matchmaking/cancel', StudentQuizController.cancelMatchmaking)

// مدیریت جریان مچ و پاسخ‌ها
router.get('/match/:matchId', StudentQuizController.getMatch)
router.post('/match/:matchId/answer', StudentQuizController.submitAnswer)
router.post('/match/:matchId/hint', StudentQuizController.useHint)
router.post('/match/:matchId/finish', StudentQuizController.finishMatch)

// جدول رده‌بندی بدون لیگ
router.get('/leaderboard', StudentQuizController.getLeaderboard)

// ماموریت‌ها
router.get('/missions', StudentQuizController.getMissions)
router.post('/missions/:missionId/claim', StudentQuizController.claimMissionReward)

// فروشگاه و آیتم‌ها
router.get('/store', StudentQuizController.getStore)
router.post('/store/buy', StudentQuizController.buyStoreItem)

// حالت رکورد انفرادی
router.post('/record/start', StudentQuizController.startRecordMode)
router.post('/record/finish', StudentQuizController.finishRecordMode)

// موضوعات، سوالات و کارخانه سوال (همگام‌سازی با پنل ادمین)
router.get('/categories', StudentQuizController.getCategories)
router.get('/questions', StudentQuizController.getQuestions)
router.post('/factory/create', StudentQuizController.createFactoryQuestion)

export default router
