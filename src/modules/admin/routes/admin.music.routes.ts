import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect, adminOnly } from '../../../core/middleware/auth.js';
import * as musicCtrl from '../controllers/admin.music.controller.js';

const audioDir = path.join(process.cwd(), 'public', 'uploads', 'music', 'audio');
const coverDir = path.join(process.cwd(), 'public', 'uploads', 'music', 'covers');

if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}
if (!fs.existsSync(coverDir)) {
  fs.mkdirSync(coverDir, { recursive: true });
}

// Multer storage for audio
const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, audioDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `track_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, unique);
  },
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;
    if (file.originalname.match(allowed) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('فقط فایل‌های صوتی مجاز هستند'));
    }
  },
});

// Multer storage for cover images
const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, coverDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `cover_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, unique);
  },
});

const coverUpload = multer({
  storage: coverStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp)$/i;
    if (file.originalname.match(allowed) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('فقط فایل‌های تصویری مجاز هستند'));
    }
  },
});

const router = Router();

// Category CRUD
router.get('/categories', protect, adminOnly, musicCtrl.getCategories);
router.post('/categories', protect, adminOnly, musicCtrl.createCategory);
router.put('/categories/:id', protect, adminOnly, musicCtrl.updateCategory);
router.delete('/categories/:id', protect, adminOnly, musicCtrl.deleteCategory);

// Track CRUD
router.get('/tracks', protect, adminOnly, musicCtrl.getTracks);
router.post('/tracks', protect, adminOnly, musicCtrl.createTrack);
router.put('/tracks/:id', protect, adminOnly, musicCtrl.updateTrack);
router.delete('/tracks/:id', protect, adminOnly, musicCtrl.deleteTrack);

// Uploads
router.post('/upload-audio', protect, adminOnly, audioUpload.single('audio'), musicCtrl.uploadAudioHandler);
router.post('/upload-cover', protect, adminOnly, coverUpload.single('cover'), musicCtrl.uploadCoverHandler);

export default router;
