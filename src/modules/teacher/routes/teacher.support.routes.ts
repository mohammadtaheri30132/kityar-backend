import { Router } from 'express';
import { TeacherSupportController } from '../controllers/teacher.support.controller.js';
import { protect } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect);

router.get('/tickets', TeacherSupportController.getTickets);
router.get('/tickets/:id', TeacherSupportController.getTicketById);
router.post('/tickets', TeacherSupportController.createTicket);
router.post('/tickets/:id/reply', TeacherSupportController.replyToTicket);

export default router;
