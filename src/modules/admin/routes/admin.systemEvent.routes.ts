import { Router } from 'express'
import { getSystemEvents, createSystemEvent, updateSystemEvent, deleteSystemEvent } from '../controllers/admin.systemEvent.controller.js'
import { protect as authMiddleware } from '../../../core/middleware/auth.js'

const router = Router()

router.use(authMiddleware)

router.get('/', getSystemEvents)
router.post('/', createSystemEvent)
router.put('/:id', updateSystemEvent)
router.delete('/:id', deleteSystemEvent)

export default router
