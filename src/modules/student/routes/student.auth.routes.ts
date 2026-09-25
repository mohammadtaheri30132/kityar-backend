import { Router } from 'express'
import { 
  requestOtp, 
  verifyOtpAndLogin,
  verifyExamJoinOtp,
  requestExamJoinOtp // 👈 این تابع را ایمپورت کنید
} from '../controllers/student.auth.controller.js'

const router = Router()

// درخواست ارسال کد تایید
// POST /api/student/auth/request-otp
router.post('/request-otp', requestOtp)

// بررسی کد تایید و ورود/ثبت‌نام نهایی
// POST /api/student/auth/verify-otp
router.post('/verify-otp', verifyOtpAndLogin)

// ورود و ثبت‌نام سریع از طریق لینک دعوت معلم (بدون OTP)
// POST /api/student/auth/join/:examId
router.post('/join/:examId/request', requestExamJoinOtp)

// POST /api/student/auth/join/:examId/verify
router.post('/join/:examId/verify', verifyExamJoinOtp)

export default router