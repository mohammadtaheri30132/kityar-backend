import { Router } from 'express'
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../controllers/admin.announcement.controller.js'
import { protect as authMiddleware } from '../../../core/middleware/auth.js'
// import { checkRole } from '../../../core/middleware/role.middleware.js' // Assuming admin middleware exists

const router = Router()

router.use(authMiddleware)
// router.use(checkRole('admin')) // Ensure only admin

router.get('/', getAnnouncements)
router.post('/', createAnnouncement)
router.put('/:id', updateAnnouncement)
router.delete('/:id', deleteAnnouncement)

export default router
