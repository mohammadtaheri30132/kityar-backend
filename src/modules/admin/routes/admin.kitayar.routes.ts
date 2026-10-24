import { Router } from 'express';
import { AdminKitayarController } from '../controllers/admin.kitayar.controller.js';
import { protect, adminOnly } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect);
router.use(adminOnly);

// Classes (کلاس‌ها)
router.get('/classes', AdminKitayarController.getClasses);
router.get('/classes/:id', AdminKitayarController.getClassDetail);

// Teachers (معلمان)
router.get('/teachers', AdminKitayarController.getTeachers);
router.get('/teachers/:id', AdminKitayarController.getTeacherProfile);
router.post('/teachers/:id/notify', AdminKitayarController.notifyTeacher);

// Students (دانش‌آموزان ثبت‌شده)
router.get('/students', AdminKitayarController.getStudents);

export default router;
