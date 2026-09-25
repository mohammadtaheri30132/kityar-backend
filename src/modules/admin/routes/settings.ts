import { Router } from 'express'
import { protect, adminOnly } from '../../../core/middleware/auth.js'
import {
  createCourse, updateCourse, deleteCourse,
  createField, updateField, deleteField,
  createGrade, updateGrade, deleteGrade,
  createBook, updateBook, deleteBook,
} from '../controllers/settingsController.js'

const router = Router()

// همه مسیرها فقط برای ادمین
router.use(protect, adminOnly)

// Courses
router.post('/courses', createCourse)
router.put('/courses/:id', updateCourse)
router.delete('/courses/:id', deleteCourse)

// Fields
router.post('/fields', createField)
router.put('/fields/:id', updateField)
router.delete('/fields/:id', deleteField)

// Grades
router.post('/grades', createGrade)
router.put('/grades/:id', updateGrade)
router.delete('/grades/:id', deleteGrade)

// Books
router.post('/books', createBook)
router.put('/books/:id', updateBook)
router.delete('/books/:id', deleteBook)

export default router
