import { Router } from 'express'
import {
  getPublicClassroomInfo,
  sendStudentOtp,
  verifyStudentOtp,
  registerStudentInClassroom,
} from '../controllers/public.classroom.controller.js'

const router = Router()

// دریافت اطلاعات عمومی کلاس
router.get('/info/:code', getPublicClassroomInfo)

// ارسال کد تایید پیامکی (OTP استاتیک)
router.post('/send-otp', sendStudentOtp)

// اعتبارسنجی کد تایید OTP
router.post('/verify-otp', verifyStudentOtp)

// ثبت‌نام نهایی دانش‌آموز در کلاس
router.post('/register', registerStudentInClassroom)

export default router
