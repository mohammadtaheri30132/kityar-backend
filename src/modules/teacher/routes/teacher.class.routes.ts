import { Router } from 'express'
import { getClasses, createClass } from '../controllers/teacher.class.controller.js'
import { protect as authMiddleware } from '../../../core/middleware/auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/', getClasses)
router.post('/', createClass)

export default router
