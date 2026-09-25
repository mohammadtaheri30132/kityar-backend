import { Router } from 'express'
import {
  checkPhone,
  registerTeacher,
  loginWithPassword,
  requestLoginOtp,
  loginWithOtp
} from '../controllers/teacher.auth.controller.js'

const router = Router()

// بررسی وضعیت شماره تماس
router.post('/check-phone', checkPhone)

// ثبت‌نام معلم جدید
router.post('/register', registerTeacher)

// ورود با رمز عبور
router.post('/login', loginWithPassword)

// درخواست کد یکبار مصرف برای ورود
router.post('/request-otp', requestLoginOtp)

// ورود با کد یکبار مصرف
router.post('/login-otp', loginWithOtp)

export default router