import { Router } from 'express'
import { getGradesByCourse, getGradeById } from '../controllers/gradeController.js'
import { createGrade, updateGrade, deleteGrade } from '../controllers/settingsController.js'
import { protect, adminOnly } from '../../../core/middleware/auth.js'

const router = Router()

router.get('/course/:courseId', protect, getGradesByCourse)
router.get('/:id', protect, getGradeById)
router.post('/', protect, adminOnly, createGrade)
router.put('/:id', protect, adminOnly, updateGrade)
router.delete('/:id', protect, adminOnly, deleteGrade)

export default router
