import { Router } from 'express'
import { getEvents, createEvent, updateEvent, deleteEvent } from '../controllers/teacher.event.controller.js'
import { protect as authMiddleware } from '../../../core/middleware/auth.js'

const router = Router()

// All event routes are protected
router.use(authMiddleware)

router.get('/', getEvents)
router.post('/', createEvent)
router.put('/:id', updateEvent)
router.delete('/:id', deleteEvent)

export default router
