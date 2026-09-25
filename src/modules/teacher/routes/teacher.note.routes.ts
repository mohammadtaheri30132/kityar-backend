import { Router } from 'express'
import { getNotes, createNote, updateNote, deleteNote } from '../controllers/teacher.note.controller.js'
import { protect as authMiddleware } from '../../../core/middleware/auth.js'

const router = Router()

// All note routes are protected
router.use(authMiddleware)

router.get('/', getNotes)
router.post('/', createNote)
router.put('/:id', updateNote)
router.delete('/:id', deleteNote)

export default router
