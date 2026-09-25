import { Router } from 'express'
import { getCourses, getCourseById } from '../controllers/courseController.js'
import { protect } from '../../../core/middleware/auth.js'

const router = Router()

router.get('/', protect, getCourses)
router.get('/:id', protect, getCourseById)

export default router
