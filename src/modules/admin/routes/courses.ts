import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { Router } from 'express'
import { getCourses, getCourseById } from '../controllers/courseController.js'
import { createCourse, updateCourse, deleteCourse, uploadCourseImage } from '../controllers/settingsController.js'
import { protect, adminOnly } from '../../../core/middleware/auth.js'

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

router.get('/', protect, getCourses)
router.get('/:id', protect, getCourseById)
router.post('/upload-image', protect, adminOnly, courseUpload.single('image'), uploadCourseImage)
router.post('/', protect, adminOnly, createCourse)
router.put('/:id', protect, adminOnly, updateCourse)
router.delete('/:id', protect, adminOnly, deleteCourse)

export default router

