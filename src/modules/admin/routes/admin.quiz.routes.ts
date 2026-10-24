import { Router } from 'express'
import { protect, adminOnly } from '../../../core/middleware/auth.js'
import { AdminQuizController } from '../controllers/admin.quiz.controller.js'

const router = Router()

router.use(protect)
router.use(adminOnly)

// داشبورد و آمار
router.get('/dashboard', AdminQuizController.getDashboard)

// تنظیمات و قوانین بازی
router.get('/config', AdminQuizController.getConfig)
router.put('/config', AdminQuizController.updateConfig)

// مدیریت ربات‌ها
router.get('/bots', AdminQuizController.getBots)

// مدیریت بازیکنان و تغییر حسابرسی‌شده موجودی
router.get('/players', AdminQuizController.getPlayers)
router.post('/players/:userId/adjust-coins', AdminQuizController.adjustCoins)

// ایجاد سریع سوال کوییز
router.post('/questions', AdminQuizController.createQuizQuestion)

export default router
