import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ExtensionPublicController } from '../controllers/extension.public.controller.js';

const router = Router();

// دایرکتوری ذخیره فایل‌های ارسالی افزونه
const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'extension');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const unique = `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // سقف ۲۰ مگابایت
});

// دریافت تنظیمات، میانبرها، رویدادهای تقویم، اخبار و دروس
router.get('/config', ExtensionPublicController.getConfig);

// ثبت‌نام و ورود با کد تایید پیامکی
router.post('/auth/send-otp', ExtensionPublicController.sendOtp);
router.post('/auth/verify-otp', ExtensionPublicController.verifyOtp);

// آپلود فایل مدارک معلم یا فایل ضمیمه چت
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'هیچ فایلی ارسال نشده است' });
    return;
  }
  const fileUrl = `/uploads/extension/${req.file.filename}`;
  res.json({
    success: true,
    fileUrl,
    fileName: req.file.originalname,
    fileSize: `${Math.round(req.file.size / 1024)} KB`,
    mimetype: req.file.mimetype,
  });
});

// سیستم چت و پیام‌رسان همکاران
router.post('/chat/check-colleague', ExtensionPublicController.checkColleague);
router.get('/chat/conversations', ExtensionPublicController.getConversations);
router.get('/chat/unread-count', ExtensionPublicController.getUnreadCount);
router.post('/chat/mark-read', ExtensionPublicController.markChatRead);
router.get('/chat/messages', ExtensionPublicController.getMessages);
router.post('/chat/send', ExtensionPublicController.sendMessage);

// دروس مقاطع تحصیلی و همگام‌سازی برنامه هفتگی مدرسه
router.get('/subjects', ExtensionPublicController.getSubjects);
router.get('/schedule', ExtensionPublicController.getSchedule);
router.post('/schedule', ExtensionPublicController.saveSchedule);

// دریافت زنده نوتیفیکیشن‌ها و اخبار
router.get('/notifications/poll', ExtensionPublicController.pollNotifications);

export default router;
