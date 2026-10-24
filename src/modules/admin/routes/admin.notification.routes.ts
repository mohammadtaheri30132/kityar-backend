import { Router } from 'express';
import { AdminNotificationController } from '../controllers/admin.notification.controller.js';
import { protect, adminOnly } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect, adminOnly);

// فیلترها و پیش‌نمایش
router.get('/teachers-count', AdminNotificationController.getFilteredTeachersCount);
router.post('/send-teachers', AdminNotificationController.sendToTeachers);
router.get('/history', AdminNotificationController.getNotificationHistory);

// تنظیمات FCM
router.get('/fcm-settings', AdminNotificationController.getFcmSettings);
router.post('/fcm-settings', AdminNotificationController.updateFcmSettings);

export default router;
