import { Router } from 'express'
import {
  getQuestionsByBook, getQuestionById, createQuestion, updateQuestion, deleteQuestion, importQuestions,
  batchUpdate, updateQuestionStatus, updateQuestionTags, forceImportQuestion,
} from '../controllers/questionController.js'
import { protect } from '../../../core/middleware/auth.js'

const router = Router()

router.get('/book/:bookId', protect, getQuestionsByBook)
router.get('/:id', protect, getQuestionById)
router.post('/', protect, createQuestion)
router.post('/force-import', protect, forceImportQuestion)
router.put('/:id', protect, updateQuestion)
router.delete('/:id', protect, deleteQuestion)
router.post('/import', protect, importQuestions)
router.post('/batch', protect, batchUpdate)
router.patch('/:id/status', protect, updateQuestionStatus)
router.patch('/:id/tags', protect, updateQuestionTags)

export default router
