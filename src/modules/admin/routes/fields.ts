import { Router } from 'express'
import { getFieldsByCourse } from '../controllers/fieldController.js'
import { createField, updateField, deleteField } from '../controllers/settingsController.js'
import { protect, adminOnly } from '../../../core/middleware/auth.js'

const router = Router()

router.get('/course/:courseId', protect, getFieldsByCourse)
router.post('/', protect, adminOnly, createField)
router.put('/:id', protect, adminOnly, updateField)
router.delete('/:id', protect, adminOnly, deleteField)

export default router
