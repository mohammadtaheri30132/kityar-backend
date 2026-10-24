import { Router } from 'express';
import {
  getStudentHomeworks,
  getStudentHomeworkById,
  updateStudentSubmissionStatus,
  submitStudentHomework,
} from '../controllers/student.homework.controller.js';
import { protect, studentOnly } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect, studentOnly);

// دریافت لیست تکالیف دانش‌آموز (امکان فیلتر با classId)
router.get('/', getStudentHomeworks);

// دریافت جزئیات یک تکلیف
router.get('/:id', getStudentHomeworkById);

// به‌روزرسانی وضعیت انجام تکلیف توسط دانش‌آموز
router.patch('/:id/status', updateStudentSubmissionStatus);

// ارسال پاسخ تکلیف (متن، عکس و ویس)
router.post('/:id/submit', submitStudentHomework);

export default router;
