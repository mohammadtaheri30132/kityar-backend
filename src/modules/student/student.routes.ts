import { Router } from 'express'
import examRoutes from './routes/student.exam.routes.js'
import authRoutes from './routes/student.auth.routes.js'

const studentRouter = Router()

// اتصال روت‌های آزمون دانش‌آموز به پیشوند /exams
studentRouter.use('/exams', examRoutes)
studentRouter.use('/auth', authRoutes)

export default studentRouter