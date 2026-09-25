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

export default router