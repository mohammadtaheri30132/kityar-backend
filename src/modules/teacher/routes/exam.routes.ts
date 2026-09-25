import { Router } from 'express'
import {
  createInitialExam,
  addQuestionsToExam,
  getTeacherExams,
  updateExam,
  deleteExam,
  getExamDashboard,
  endExamManually,
  getStudentSessionForGrading,
  updateExamQuestions,
  submitStudentGrade,
  getExamReportCard,
  getExamById, // اضافه شده برای دریافت جزئیات و سوالات قبلی آزمون
  previewFinalizeExam,
  finalizeExamGrades
} from '../controllers/exam.controller.js'
import { protect, teacherOnly } from '../../../core/middleware/auth.js'

const router = Router()

// اعمال میدلورهای امنیتی: تمام این مسیرها فقط برای معلمِ لاگین‌شده در دسترس هستند
router.use(protect, teacherOnly)

// ==========================================
// مسیرهای مدیریت و ساخت آزمون
// ==========================================

// دریافت تاریخچه و لیست تمام آزمون‌های معلم
// GET /api/teacher/exams/
router.get('/', getTeacherExams)

// دریافت جزئیات یک آزمون خاص (استفاده در داشبورد و صفحه ویرایش سوالات)
// GET /api/teacher/exams/:examId
router.get('/:examId', getExamById)

// مرحله اول: ساخت تنظیمات اولیه آزمون
// POST /api/teacher/exams/
router.post('/', createInitialExam)

// مرحله دوم: الصاق گروهی سوالات به آزمونِ ساخته شده
// POST /api/teacher/exams/:examId/questions
router.post('/:examId/questions', addQuestionsToExam)

// ویرایش لیست سوالات آزمون
// PUT /api/teacher/exams/:examId/questions
router.put('/:examId/questions', updateExamQuestions)

// ==========================================
// مسیرهای تنظیمات و داشبورد آزمون
// ==========================================

// ویرایش تنظیمات آزمون
// PUT /api/teacher/exams/:examId
router.put('/:examId', updateExam)

// حذف یک آزمون مشخص
// DELETE /api/teacher/exams/:examId
router.delete('/:examId', deleteExam)

// دریافت داشبورد وضعیتِ لحظه‌ای دانش‌آموزان برای یک آزمون خاص
// GET /api/teacher/exams/:examId/dashboard
router.get('/:examId/dashboard', getExamDashboard)

// پایان دادن دستی به آزمون
// PATCH /api/teacher/exams/:examId/end
router.patch('/:examId/end', endExamManually)

// ==========================================
// مسیرهای تصحیح و نمره‌دهی
// ==========================================

// دریافت پاسخ‌برگ یک دانش‌آموز برای تصحیح
// GET /api/teacher/exams/:examId/sessions/:sessionId
router.get('/:examId/sessions/:sessionId', getStudentSessionForGrading)

// ثبت نمره نهایی برای یک پاسخ‌برگ
// POST /api/teacher/exams/:examId/sessions/:sessionId/grade
router.post('/:examId/sessions/:sessionId/grade', submitStudentGrade)

// دریافت کارنامه (توجه: این روت در اینجا توسط میدلور معلم محافظت می‌شود!)
// GET /api/teacher/exams/:examId/report
router.get('/:examId/report', getExamReportCard)

// پیش‌نمایش و ثبت نهایی دانش‌آموزان در کلاس
router.get('/:examId/finalize-preview', previewFinalizeExam)
router.post('/:examId/finalize', finalizeExamGrades)

export default router