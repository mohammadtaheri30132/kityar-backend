import { Router } from 'express';
import { AdminNotificationController } from '../controllers/admin.notification.controller.js';
import { protect, adminOnly } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect, adminOnly);

// فیلترها و پیش‌نمایش معلمان
router.get('/teachers-count', AdminNotificationController.getFilteredTeachersCount);
router.post('/send-teachers', AdminNotificationController.sendToTeachers);

// ارسال به دانش‌آموزان
router.get('/students-count', AdminNotificationController.getFilteredStudentsCount);
router.post('/send-students', AdminNotificationController.sendToStudents);

// ارسال همگانی و هدفمند
router.post('/send-all', AdminNotificationController.sendToAll);
router.post('/send-targeted', AdminNotificationController.sendTargeted);

router.get('/history', AdminNotificationController.getNotificationHistory);

// تنظیمات FCM
router.get('/fcm-settings', AdminNotificationController.getFcmSettings);
router.post('/fcm-settings', AdminNotificationController.updateFcmSettings);

// ارسال نوتیفیکیشن آزمایشی (تست)
router.post('/send-test', AdminNotificationController.sendTestNotification);

export default router;
