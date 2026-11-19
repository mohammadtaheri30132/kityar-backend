import { Router } from 'express'
import {
  getPlannerCurriculum,
  getStudentBookDetail,
  getStudentBookQuestions,
  getStudentBooks,
  getStudentEduLevels,
  getStudentGradesAndFields,
  searchStudentEduByKeywords,
} from '../../student/controllers/student.eduContent.controller.js'

const router = Router()

router.get('/levels', getStudentEduLevels)
router.get('/levels/:levelId/grades', getStudentGradesAndFields)
router.get('/books', getStudentBooks)
router.get('/books/:bookId', getStudentBookDetail)
router.get('/books/:bookId/questions', getStudentBookQuestions)
router.get('/search', searchStudentEduByKeywords)
router.get('/planner/curriculum', getPlannerCurriculum)

export default router
