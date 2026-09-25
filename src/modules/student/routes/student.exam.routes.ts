import { Router } from 'express'
import {
  getMyExams,
  enterExam,
  submitAnswer,
  getExamQuestions,
  finishExam,
  startExam, 
  submitExam,
  getExamInfo // 👈 فقط این مورد به ایمپورت‌ها اضافه شد
} from '../controllers/student.exam.controller.js'
import { uploadStudentMedia } from '../controllers/student.upload.controller.js';
import multer from 'multer';

// تنظیمات ذخیره‌سازی فایل‌ها
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + '-' + file.originalname)
  }
})
const upload = multer({ storage })

// فرض بر این است که میدلور احراز هویت در هسته مشترک قرار دارد
import { protect, studentOnly } from '../../../core/middleware/auth.js';

const router = Router()

// تمام مسیرهای دانش‌آموز نیاز به احراز هویت (لاگین) دارند
router.use(protect, studentOnly);

// دریافت لیست آزمون‌ها برای داشبورد دانش‌آموز
// GET /api/student/exams/
router.get('/', getMyExams)

// 💡 مسیر جدید برای دریافت اطلاعات اولیه آزمون (اتاق انتظار)
// GET /api/student/exams/:examId/info
router.get('/:examId/info', getExamInfo);

// GET /api/student/exams/:examId/start
router.get('/:examId/start', startExam);

// ورود به آزمون (شروع جدید یا بازگشت به آزمون قبلی)
// POST /api/student/exams/:examId/enter
router.post('/:examId/enter', enterExam)

// ثبت پاسخ یک سوال در حین آزمون
// POST /api/student/exams/:examId/answer
router.post('/:examId/answer', submitAnswer)

// دریافت سوالات آزمون
// GET /api/student/exams/:examId/questions
router.get('/:examId/questions', getExamQuestions)

// POST /api/student/exams/:examId/submit
router.post('/:examId/submit', submitExam);

// ثبت نهایی و پایان دادن به آزمون توسط دانش‌آموز
// POST /api/student/exams/:examId/finish
router.post('/:examId/finish', finishExam)

// آپلود فایل توسط دانش‌آموز (عکس یا ویس)
router.post('/upload-media', upload.single('file'), uploadStudentMedia);

export default router