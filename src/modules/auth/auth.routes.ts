import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  checkPhone,
  verifyOtp,
  completeProfile,
  loginWithPassword,
  requestLoginOtp,
  loginWithOtp,
  resetPassword,
  getMe,
} from './auth.controller.js';
import { protect } from '../../core/middleware/auth.js';

const router = Router();

// آماده‌سازی دایرکتوری ذخیره تصاویر پروفایل
const avatarDir = path.join(process.cwd(), 'public/uploads/avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, avatarDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // حداکثر ۵ مگابایت
});

// ۱. بررسی وضعیت شماره تلفن همراه
router.post('/check-phone', checkPhone);

// ۲. اعتبارسنجی کد تایید OTP
router.post('/verify-otp', verifyOtp);

// ۳. تکمیل اطلاعات پروفایل و ثبت‌نام نهایی
router.post('/complete-profile', completeProfile);
router.post('/register', completeProfile);

// ۴. ورود با رمز عبور
router.post('/login', loginWithPassword);
router.post('/login-password', loginWithPassword);

// ۵. درخواست کد یک‌بارمصرف
router.post('/request-otp', requestLoginOtp);

// ۶. ورود با کد یک‌بارمصرف
router.post('/login-otp', loginWithOtp);

// ۷. فراموشی و بازنشانی رمز عبور
router.post('/reset-password', resetPassword);
router.post('/forgot-password', resetPassword);

// ۸. آپلود تصویر آواتار / پروفایل
router.post('/upload-avatar', upload.single('avatar'), (req: Request, res: Response) => {
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

// ۹. دریافت اطلاعات کاربری و آمار دعوت‌شده‌ها
router.get('/me', protect, getMe);

export default router;

