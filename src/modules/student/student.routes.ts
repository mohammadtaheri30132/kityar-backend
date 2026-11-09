import { Router } from 'express'
import examRoutes from './routes/student.exam.routes.js'
import authRoutes from './routes/student.auth.routes.js'
import classroomRoutes from './routes/student.classroom.routes.js'
import profileRoutes from './routes/student.profile.routes.js'
import quizRoutes from './routes/student.quiz.routes.js'
import homeworkRoutes from './routes/student.homework.routes.js'
import notificationRoutes from './routes/student.notification.routes.js'
import studentMarketplaceRoutes from './routes/student.marketplace.routes.js'

const studentRouter = Router()

// اتصال روت‌های عمومی و ورود دانش‌آموز در بالاترین اولویت
studentRouter.use('/auth', authRoutes)

// اتصال سایر روت‌های اختصاصی دانش‌آموز
studentRouter.use('/exams', examRoutes)
studentRouter.use('/classrooms', classroomRoutes)
studentRouter.use('/profile', profileRoutes)
studentRouter.use('/quiz', quizRoutes)
studentRouter.use('/homeworks', homeworkRoutes)
studentRouter.use('/notifications', notificationRoutes)

// روت‌های بازارچه، رفع اشکال و کلاس آنلاین
studentRouter.use('/', studentMarketplaceRoutes)

export default studentRouter