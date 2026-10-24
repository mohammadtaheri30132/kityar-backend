import { Router } from 'express';
import {
  getMyClasses,
  searchClassByCode,
  requestJoinClass,
  getClassStudentReports,
  getMyExams,
} from '../controllers/student.classroom.controller.js';
import { protect, studentOnly } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect, studentOnly);

// دریافت لیست کلاس‌های دانش‌آموز
router.get('/my-classes', getMyClasses);

// دریافت تمام آزمون‌های دانش‌آموز در کلاس‌های فعال
router.get('/my-exams', getMyExams);

// جستجوی کلاس با شناسه عددی
router.get('/search/:code', searchClassByCode);

// ارسال درخواست عضویت در کلاس
router.post('/join-request', requestJoinClass);

// دریافت گزارشات و کارنامه و حضور و غیاب دانش‌آموز در کلاس
router.get('/:classroomId/reports', getClassStudentReports);

export default router;
