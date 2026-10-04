import { Router } from 'express'
import {
  getGradebookRecords,
  createGradebookRecord,
  deleteGradebookRecord,
  saveGradebookAttendance
} from '../controllers/teacher.gradebook.controller.js'
import { protect, teacherOnly } from '../../../core/middleware/auth.js'

const router = Router({ mergeParams: true })

router.use(protect, teacherOnly)

router.get('/', getGradebookRecords)
router.post('/', createGradebookRecord)
router.post('/attendance', saveGradebookAttendance)
router.delete('/:recordId', deleteGradebookRecord)

export default router
