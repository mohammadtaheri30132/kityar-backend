import { Router } from 'express'

// مسیرها اینجا نسبت به پوشه admin/routes تنظیم شده
import authRoutes from './routes/auth.js'
import dashboardRoutes from './routes/dashboard.js'
import courseRoutes from './routes/courses.js'
import fieldRoutes from './routes/fields.js'
import gradeRoutes from './routes/grades.js'
import bookRoutes from './routes/books.js'
import questionRoutes from './routes/questions.js'
import settingsRoutes from './routes/settings.js'
import announcementRoutes from './routes/admin.announcement.routes.js'
import systemEventRoutes from './routes/admin.systemEvent.routes.js'
import communityRoutes from './routes/admin.community.routes.js'
import quizRoutes from './routes/admin.quiz.routes.js'
import musicRoutes from './routes/admin.music.routes.js'
import phonebookRoutes from './routes/admin.phonebook.routes.js'
import notificationRoutes from './routes/admin.notification.routes.js'
import supportRoutes from './routes/admin.support.routes.js'
import kitayarRoutes from './routes/admin.kitayar.routes.js'

const adminRouter = Router()

// دقت کن که اینجا دیگه پیشوند /api/auth نداریم، فقط /auth
adminRouter.use('/auth', authRoutes)
adminRouter.use('/dashboard', dashboardRoutes)
adminRouter.use('/community', communityRoutes)
adminRouter.use('/courses', courseRoutes)
adminRouter.use('/fields', fieldRoutes)
adminRouter.use('/grades', gradeRoutes)
adminRouter.use('/books', bookRoutes)
adminRouter.use('/questions', questionRoutes)
adminRouter.use('/settings', settingsRoutes)
adminRouter.use('/announcements', announcementRoutes)
adminRouter.use('/system-events', systemEventRoutes)
adminRouter.use('/quiz', quizRoutes)
adminRouter.use('/music', musicRoutes)
adminRouter.use('/phonebook', phonebookRoutes)
adminRouter.use('/notifications', notificationRoutes)
adminRouter.use('/support', supportRoutes)
adminRouter.use('/kitayar', kitayarRoutes)

export default adminRouter