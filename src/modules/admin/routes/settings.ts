import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { Router } from 'express'
import { protect, adminOnly } from '../../../core/middleware/auth.js'
import {
  createCourse, updateCourse, deleteCourse, uploadCourseImage,
  createField, updateField, deleteField,
  createGrade, updateGrade, deleteGrade,
  createBook, updateBook, deleteBook,
} from '../controllers/settingsController.js'

const courseDir = path.join(process.cwd(), 'public', 'uploads', 'courses')
if (!fs.existsSync(courseDir)) {
  fs.mkdirSync(courseDir, { recursive: true })
}

const courseStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, courseDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const unique = `course_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`
    cb(null, unique)
  },
})

const courseUpload = multer({
  storage: courseStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp|svg)$/i
    if (file.originalname.match(allowed) || file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('فقط فایل‌های تصویری مجاز هستند'))
    }
  },
})

const router = Router()

// همه مسیرها فقط برای ادمین
router.use(protect, adminOnly)

// Courses
router.post('/courses/upload-image', courseUpload.single('image'), uploadCourseImage)
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
