import { Router } from 'express'
import {
  createClassroom,
  getMyClassrooms,
  getClassroomById,
  addStudentsToClassroom,
  removeStudentFromClassroom,
  getClassroomStudents,
  getClassroomJoinRequests,
  acceptClassroomJoinRequest,
  rejectClassroomJoinRequest,
  getUnmatchedResults,
  matchStudentResult,
  getClassroomReports,
  updateClassroom,
  deleteClassroom,
  getStudentProfileFull,
  updateStudentInfo,
  addStudentNote
} from '../controllers/teacher.classroom.controller.js'
import {
  getClassSessions,
  getSessionAttendance,
  saveSessionAttendance,
  getStudentAttendanceHistory
} from '../controllers/teacher.attendance.controller.js'
import gradebookRoutes from './teacher.gradebook.routes.js'
import { protect, teacherOnly } from '../../../core/middleware/auth.js'

const router = Router()

// اعمال میدلورهای امنیتی
router.use(protect, teacherOnly)

// دریافت لیست کلاس‌ها و ساخت کلاس جدید
router.route('/')
  .get(getMyClassrooms)
  .post(createClassroom)

// افزودن دانش‌آموزان به یک کلاس خاص
router.post('/:classroomId/students', addStudentsToClassroom)

// حذف یک دانش‌آموز مشخص از کلاس
router.delete('/:classroomId/students/:studentPhone', removeStudentFromClassroom)

// دریافت پروفایل کامل یک دانش‌آموز شامل یادداشت‌ها و حضور غیاب
router.get('/:classroomId/students/:studentPhone/profile', getStudentProfileFull)
router.put('/:classroomId/students/:studentPhone/profile', updateStudentInfo)
router.post('/:classroomId/students/:studentPhone/notes', addStudentNote)

// دریافت لیست دقیق دانش‌آموزان با عضویت‌ها
router.get('/:classroomId/students/list', getClassroomStudents)
router.get('/:classroomId/students', getClassroomStudents)

// دریافت درخواست‌های عضویت، پذیرش و رد درخواست
router.get('/:classroomId/join-requests', getClassroomJoinRequests)
router.post('/:classroomId/join-requests/:requestId/accept', acceptClassroomJoinRequest)
router.post('/:classroomId/join-requests/:requestId/reject', rejectClassroomJoinRequest)

// دریافت نتایج نیازمند بررسی
router.get('/:classroomId/unmatched', getUnmatchedResults)

// اتصال دستی یک نتیجه به دانش‌آموز
router.post('/:classroomId/unmatched/:sessionId/match', matchStudentResult)

// دریافت گزارشات و آمارهای کلاس
router.get('/:classroomId/reports', getClassroomReports)

// ویرایش، دریافت و حذف اطلاعات کلاس
router.route('/:classroomId')
  .get(getClassroomById)
  .put(updateClassroom)
  .delete(deleteClassroom)

// Attendance routes
router.get('/:classroomId/sessions', getClassSessions)
router.get('/:classroomId/sessions/:sessionId/attendance', getSessionAttendance)
router.post('/:classroomId/sessions/:sessionId/attendance', saveSessionAttendance)
router.get('/:classroomId/students/:studentPhone/attendance', getStudentAttendanceHistory)

// Gradebook routes
router.use('/:classroomId/gradebook', gradebookRoutes)

export default router