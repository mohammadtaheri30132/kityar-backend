import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { protect, teacherOnly } from '../../../core/middleware/auth.js'; 
import { verifyHMAC } from '../../../core/utils/security.js'; // 👈 فقط میدلور امضا
import {
  getCourses,
  getFieldsAndGrades,
  getBooks,
  getLessons,
  generateRandomQuestions,
  uploadPdf,
  uploadMedia
} from '../controllers/teacher.builder.controller.js';

const router = Router();

const uploadDir = path.join(process.cwd(), 'public', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); 
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `media-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

router.use(protect, teacherOnly);

// روت‌های عادی بدون امضا
router.get('/courses', getCourses);
router.get('/courses/:courseId/fields-grades', getFieldsAndGrades);
router.get('/grades/:gradeId/books', getBooks);
router.get('/books/:bookId/lessons', getLessons);
router.post('/upload-pdf', upload.single('pdf'), uploadPdf);
router.post('/upload-media', upload.single('file'), uploadMedia);

// 👈 روت حساس با لایه امنیتی HMAC
router.post('/generate', verifyHMAC, generateRandomQuestions);

export default router;