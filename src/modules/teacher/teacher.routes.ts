// modules/teacher/teacher.routes.ts
import { Router } from 'express'
import examRoutes from './routes/exam.routes.js'
import authRoutes from './routes/teacher.auth.routes.js'
import profileRoutes from './routes/teacher.profile.routes.js'
import classroomRoutes from './routes/teacher.classroom.routes.js'
import questionRoutes from './routes/teacher.question.routes.js'
import builderRoutes from './routes/teacher.builder.routes.js'
import eventRoutes from './routes/teacher.event.routes.js'
import taskRoutes from './routes/teacher.task.routes.js'
import noteRoutes from './routes/teacher.note.routes.js'
import schoolRoutes from './routes/teacher.school.routes.js'
import classRoutes from './routes/teacher.class.routes.js'
import scheduleRoutes from './routes/teacher.schedule.routes.js'
import announcementRoutes from './routes/teacher.announcement.routes.js'
import systemEventRoutes from './routes/teacher.systemEvent.routes.js'

const teacherRouter = Router()

teacherRouter.use('/exams', examRoutes)
teacherRouter.use('/auth', authRoutes)
teacherRouter.use('/profile', profileRoutes)
teacherRouter.use('/classrooms', classroomRoutes)
teacherRouter.use('/questions', questionRoutes)
teacherRouter.use('/builder', builderRoutes)
teacherRouter.use('/events', eventRoutes)
teacherRouter.use('/tasks', taskRoutes)
teacherRouter.use('/notes', noteRoutes)
teacherRouter.use('/schools', schoolRoutes)
teacherRouter.use('/classes', classRoutes)
teacherRouter.use('/schedule', scheduleRoutes)
teacherRouter.use('/announcements', announcementRoutes)
teacherRouter.use('/system-events', systemEventRoutes)

export default teacherRouter