import { Router } from 'express'
import { protect } from '../../../core/middleware/auth.js'
import {
  generateAiStudyPlan,
  getPlannerCurriculum,
  getStudentBookDetail,
  getStudentBookQuestions,
  getStudentBooks,
  getStudentEduLevels,
  getStudentGradesAndFields,
  recordStudentStudyProgress,
  searchStudentEduByKeywords,
} from '../controllers/student.eduContent.controller.js'

const router = Router()

router.get('/levels', getStudentEduLevels)
router.get('/levels/:levelId/grades', getStudentGradesAndFields)
router.get('/books', getStudentBooks)
router.get('/books/:bookId', getStudentBookDetail)
router.get('/books/:bookId/questions', getStudentBookQuestions)
router.get('/search', searchStudentEduByKeywords)

// Protected student endpoints (profile progress + personalized AI planner)
router.post('/progress', protect, recordStudentStudyProgress)
router.get('/planner/curriculum', protect, getPlannerCurriculum)
router.post('/planner/generate', protect, generateAiStudyPlan)

export default router
