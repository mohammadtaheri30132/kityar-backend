import { Router } from 'express';
import {
  createSmartExam,
  generateSheetsForStudents,
  getExamSheets,
  lookupSheetByCode,
  gradeExamSheet,
} from '../controllers/teacher.smartsheet.controller.js';
import { protect, teacherOnly } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect, teacherOnly);

// ایجاد آزمون تستی هوشمند
router.post('/exams', createSmartExam);

// صدور و تولید پاسخ‌برگ برای دانش‌آموزان
router.post('/generate', generateSheetsForStudents);

// استعلام پاسخ‌برگ بر اساس کد برگه (QR یا ورود دستی)
router.get('/lookup', lookupSheetByCode);

// ثبت نمره نهایی پاسخ‌برگ (تصحیح هوشمند یا دستی)
router.post('/grade', gradeExamSheet);

// دریافت لیست پاسخ‌برگ‌های صادرشده برای یک آزمون
router.get('/exams/:examId/sheets', getExamSheets);

export default router;
