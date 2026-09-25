import { Router } from 'express'
import { getProfile, updateProfile } from '../controllers/teacher.profile.controller.js'
import { protect, teacherOnly } from '../../../core/middleware/auth.js'

const router = Router()

// اعمال میدلورها: کاربر حتماً باید لاگین کرده باشد و نقش او معلم باشد
router.use(protect, teacherOnly)

// مسیر دریافت اطلاعات پروفایل
// GET /api/teacher/profile/
router.get('/', getProfile)

// مسیر ویرایش و تکمیل پروفایل
// PUT /api/teacher/profile/
router.put('/', updateProfile)

export default router