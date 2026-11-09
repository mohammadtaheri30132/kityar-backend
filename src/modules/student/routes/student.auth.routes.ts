import { Router } from 'express';
import {
  requestOtp,
  verifyOtpAndLogin,
  verifyExamJoinOtp,
  requestExamJoinOtp,
  getExamJoinInfo,
} from '../controllers/student.auth.controller.js';
import {
  checkPhone,
  verifyOtp,
  completeProfile,
  loginWithPassword,
  loginWithOtp,
  resetPassword,
  getMe,
} from '../../auth/auth.controller.js';
import { protect } from '../../../core/middleware/auth.js';

const router = Router();

// ۱. بررسی وضعیت شماره تلفن (هماهنگ با کل سامانه)
router.post('/check-phone', (req, res) => {
  req.body.role = 'student';
  return checkPhone(req, res);
});

// ۲. اعتبارسنجی کد تایید
router.post('/verify-otp-only', verifyOtp);

// ۳. ثبت‌نام دانش‌آموز جدید و تکمیل پروفایل
router.post('/register', (req, res) => {
  req.body.role = 'student';
  return completeProfile(req, res);
});
router.post('/complete-profile', (req, res) => {
  req.body.role = 'student';
  return completeProfile(req, res);
});

// ۴. ورود با رمز عبور
router.post('/login', (req, res) => {
  req.body.role = 'student';
  return loginWithPassword(req, res);
});

// ۵. ورود با کد یک‌بارمصرف
router.post('/login-otp', (req, res) => {
  req.body.role = 'student';
  return loginWithOtp(req, res);
});

// ۶. بازنشانی رمز عبور
router.post('/reset-password', resetPassword);

// ۷. دریافت اطلاعات کاربر و تعداد دعوت‌شده‌ها
router.get('/me', protect, getMe);

// ۸. درخواست ارسال کد تایید قدیمی نوکیتا
router.post('/request-otp', requestOtp);

// ۹. بررسی کد تایید و ورود/ثبت‌نام مستقیم قدیمی نوکیتا
router.post('/verify-otp', verifyOtpAndLogin);

// ۱۰. ورود سریع به جلسه آزمون از طریق لینک معلم
router.get('/join/:examId/info', getExamJoinInfo);
router.post('/join/:examId/request', requestExamJoinOtp);
router.post('/join/:examId/verify', verifyExamJoinOtp);

export default router;
