import { Router } from 'express'
import { getSchools, createSchool } from '../controllers/teacher.school.controller.js'
import { protect as authMiddleware } from '../../../core/middleware/auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/', getSchools)
router.post('/', createSchool)

export default router
