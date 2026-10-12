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

export default adminRouter