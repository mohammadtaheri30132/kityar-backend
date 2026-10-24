import { Router } from 'express';
import {
  getHomeworks,
  getHomeworkById,
  createHomework,
  updateHomework,
  deleteHomework,
  updateStudentHomeworkStatus,
  reviewStudentHomework,
} from '../controllers/teacher.homework.controller.js';
import { protect as authMiddleware } from '../../../core/middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', getHomeworks);
router.get('/:id', getHomeworkById);
router.post('/', createHomework);
router.put('/:id', updateHomework);
router.delete('/:id', deleteHomework);
router.patch('/:id/students/:phone/status', updateStudentHomeworkStatus);
router.post('/:id/students/:phone/review', reviewStudentHomework);

export default router;
