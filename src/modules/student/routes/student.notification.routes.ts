import { Router } from 'express';
import { StudentNotificationController } from '../controllers/student.notification.controller.js';
import { protect, studentOnly } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect, studentOnly);

router.get('/', StudentNotificationController.getNotifications);
router.get('/unread-count', StudentNotificationController.getUnreadCount);
router.put('/:id/read', StudentNotificationController.markAsRead);
router.put('/read-all', StudentNotificationController.markAllAsRead);
router.post('/device-token', StudentNotificationController.registerDeviceToken);

export default router;
