import { Router } from 'express';
import { AdminSupportController } from '../controllers/admin.support.controller.js';
import { protect, adminOnly } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect);
router.use(adminOnly);

router.get('/tickets', AdminSupportController.getTickets);
router.get('/tickets/:id', AdminSupportController.getTicketById);
router.post('/tickets/:id/reply', AdminSupportController.replyToTicket);
router.patch('/tickets/:id/status', AdminSupportController.updateStatus);

export default router;
