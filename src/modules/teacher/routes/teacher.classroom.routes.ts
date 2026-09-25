import { Router } from 'express'
import {
  createClassroom,
  getMyClassrooms,
  addStudentsToClassroom,
  removeStudentFromClassroom,
  getClassroomStudents,
  getUnmatchedResults,
  matchStudentResult,
  getClassroomReports,
  updateClassroom
} from '../controllers/teacher.classroom.controller.js'
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

// دریافت لیست دقیق دانش‌آموزان با عضویت‌ها
router.get('/:classroomId/students/list', getClassroomStudents)

// دریافت نتایج نیازمند بررسی
router.get('/:classroomId/unmatched', getUnmatchedResults)

// اتصال دستی یک نتیجه به دانش‌آموز
router.post('/:classroomId/unmatched/:sessionId/match', matchStudentResult)

// دریافت گزارشات و آمارهای کلاس
router.get('/:classroomId/reports', getClassroomReports)

// ویرایش اطلاعات کلاس
router.put('/:classroomId', updateClassroom)

export default router