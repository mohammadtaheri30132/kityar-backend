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
} from '../../auth/auth.controller.js';
import { protect } from '../../../core/middleware/auth.js';

const router = Router();

// دایرکتوری ذخیره تصاویر پروفایل
const avatarDir = path.join(process.cwd(), 'public/uploads/avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarDir),
    filename: (_req, file, cb) => cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname) || '.jpg'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// بررسی وضعیت شماره تماس
router.post('/check-phone', checkPhone);

// اعتبارسنجی کد تایید
router.post('/verify-otp', verifyOtp);

// ثبت‌نام معلم جدید / تکمیل پروفایل
router.post('/register', completeProfile);
router.post('/complete-profile', completeProfile);

// ورود با رمز عبور
router.post('/login', loginWithPassword);
router.post('/login-password', loginWithPassword);

// درخواست کد یکبار مصرف برای ورود
router.post('/request-otp', requestLoginOtp);

// ورود با کد یکبار مصرف
router.post('/login-otp', loginWithOtp);

// فراموشی و بازنشانی رمز عبور
router.post('/reset-password', resetPassword);
router.post('/forgot-password', resetPassword);

// آپلود تصویر پروفایل
router.post('/upload-avatar', upload.single('avatar'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'فایل تصویر دریافت نشد' });
    return;
  }
  res.status(200).json({
    success: true,
    message: 'تصویر با موفقیت بارگذاری شد',
    data: { avatarUrl: `/uploads/avatars/${req.file.filename}` },
  });
});

// اطلاعات کاربر جاری و تعداد دعوت‌شده‌ها
router.get('/me', protect, getMe);

export default router;
