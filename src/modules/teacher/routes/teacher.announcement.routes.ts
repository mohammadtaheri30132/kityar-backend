import { Router } from 'express'
import { getActiveAnnouncements, dismissAnnouncement } from '../controllers/teacher.announcement.controller.js'
import { protect as authMiddleware } from '../../../core/middleware/auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/active', getActiveAnnouncements)
router.post('/:id/dismiss', dismissAnnouncement)

export default router
