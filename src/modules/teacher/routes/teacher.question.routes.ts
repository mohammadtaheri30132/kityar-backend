import { Router } from 'express';
import { getQuestionsBank, createTeacherQuestion, updateTeacherQuestion, deleteTeacherQuestion } from '../controllers/teacher.question.controller.js';
import { protect, teacherOnly } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect, teacherOnly);

// GET /api/teacher/questions
router.route('/')
  .get(getQuestionsBank)
  .post(createTeacherQuestion);

router.route('/:id')
  .put(updateTeacherQuestion)
  .delete(deleteTeacherQuestion);

export default router;