import { Router } from 'express'
import { getSchedule, createSchedule } from '../controllers/teacher.schedule.controller.js'
import { protect as authMiddleware } from '../../../core/middleware/auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/', getSchedule)
router.post('/', createSchedule)

export default router
