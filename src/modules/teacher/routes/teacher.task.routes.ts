import { Router } from 'express'
import { getTasks, createTask, updateTask, deleteTask } from '../controllers/teacher.task.controller.js'
import { protect as authMiddleware } from '../../../core/middleware/auth.js'

const router = Router()

// All task routes are protected
router.use(authMiddleware)

router.get('/', getTasks)
router.post('/', createTask)
router.put('/:id', updateTask)
router.delete('/:id', deleteTask)

export default router
