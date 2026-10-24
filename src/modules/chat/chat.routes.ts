import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ChatController } from './chat.controller.js';
import { protect } from '../../core/middleware/auth.js';

const router = Router();

// ساخت دایرکتوری آپلود چت در صورت عدم وجود
const chatUploadDir = path.join(process.cwd(), 'public', 'uploads', 'chat');
if (!fs.existsSync(chatUploadDir)) {
  fs.mkdirSync(chatUploadDir, { recursive: true });
}

// تنظیمات Multer برای فایل‌های ویس و عکس‌های WebP
const chatStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatUploadDir),
  filename: (_req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    if (!ext) {
      if (file.mimetype.includes('webp')) ext = '.webp';
      else if (file.mimetype.includes('audio') || file.mimetype.includes('m4a')) ext = '.m4a';
      else ext = '.bin';
    }
    const uniqueName = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage: chatStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (_req, file, cb) => {
    const isImage = file.mimetype.startsWith('image/') || /\.(webp|jpg|jpeg|png)$/i.test(file.originalname);
    const isAudio = file.mimetype.startsWith('audio/') || /\.(m4a|aac|mp3|ogg|wav|webm)$/i.test(file.originalname);

    if (isImage || isAudio) {
      cb(null, true);
    } else {
      cb(new Error('تنها ارسال فایل صوتی و تصویر مجاز است'));
    }
  },
});

router.use(protect);

// روت آپلود مدیا
router.post('/upload', upload.single('file'), ChatController.uploadMedia);

// پیام‌های کلاس
router.get('/classrooms/:classId/messages', ChatController.getMessages);
router.post('/classrooms/:classId/messages', ChatController.sendMessage);
router.delete('/classrooms/:classId/messages/:messageId', ChatController.deleteMessage);

export default router;
