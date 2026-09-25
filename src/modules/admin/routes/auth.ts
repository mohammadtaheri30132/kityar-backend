import { Router } from 'express'
import { login, getMe } from '../controllers/authController.js'
import { protect } from '../../../core/middleware/auth.js'

const router = Router()

// مسیرهای عمومی
router.post('/login', login)

// مسیرهای محافظت‌شده
router.get('/me', protect, getMe)

export default router
