import { Router } from 'express';
import { TeacherNotificationController } from '../controllers/teacher.notification.controller.js';
import { protect } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect);

router.get('/', TeacherNotificationController.getNotifications);
router.get('/unread-count', TeacherNotificationController.getUnreadCount);
router.put('/:id/read', TeacherNotificationController.markAsRead);
router.put('/read-all', TeacherNotificationController.markAllAsRead);
router.post('/device-token', TeacherNotificationController.registerDeviceToken);

export default router;
