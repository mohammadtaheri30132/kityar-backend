import { Router } from 'express'
import { getDashboardStats } from '../controllers/dashboardController.js'
import { protect } from '../../../core/middleware/auth.js'

const router = Router()

router.get('/', protect, getDashboardStats)

export default router
