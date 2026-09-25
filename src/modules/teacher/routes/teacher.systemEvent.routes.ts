import { Router } from 'express'
import { getActiveSystemEvents } from '../controllers/teacher.systemEvent.controller.js'
import { protect as authMiddleware } from '../../../core/middleware/auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/', getActiveSystemEvents)

export default router
