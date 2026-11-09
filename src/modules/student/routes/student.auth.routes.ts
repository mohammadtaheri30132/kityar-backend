import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
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

// آماده‌سازی دایرکتوری ذخیره تصاویر پروفایل
const avatarDir = path.join(process.cwd(), 'public/uploads/avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, avatarDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const uploadAvatarMiddleware = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// آپلود تصویر پروفایل دانش‌آموز
router.post('/upload-avatar', uploadAvatarMiddleware.single('avatar'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'فایل تصویر دریافت نشد' });
    return;
  }
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  res.status(200).json({
    success: true,
    message: 'تصویر پروفایل با موفقیت بارگذاری شد',
    data: { avatarUrl },
  });
});

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
