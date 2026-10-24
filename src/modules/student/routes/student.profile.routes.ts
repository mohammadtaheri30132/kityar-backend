import { Router } from 'express';
import {
  getStudentProfile,
  updateStudentProfile,
  applyInviteCode,
  getStudentSchedule,
  updateStudentSchedule,
} from '../controllers/student.profile.controller.js';
import { protect, studentOnly } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect, studentOnly);

// دریافت پروفایل دانش‌آموز جاری
router.get('/', getStudentProfile);

// ویرایش پروفایل دانش‌آموز (فیلدهای مجاز)
router.put('/', updateStudentProfile);

// اعمال کد دعوت دانش‌آموز دیگر
router.post('/apply-invite-code', applyInviteCode);

// دریافت برنامه هفتگی مدرسه
router.get('/schedule', getStudentSchedule);

// ویرایش/ذخیره برنامه هفتگی مدرسه
router.put('/schedule', updateStudentSchedule);

export default router;
