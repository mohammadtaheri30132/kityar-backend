import { Router } from 'express'
import { getBooksByGrade, getBookById } from '../controllers/bookController.js'
import { createBook, updateBook, deleteBook } from '../controllers/settingsController.js'
import { protect, adminOnly } from '../../../core/middleware/auth.js'

const router = Router()

router.get('/grade/:gradeId', protect, getBooksByGrade)
router.get('/:id', protect, getBookById)
router.post('/', protect, adminOnly, createBook)
router.put('/:id', protect, adminOnly, updateBook)
router.delete('/:id', protect, adminOnly, deleteBook)

export default router
