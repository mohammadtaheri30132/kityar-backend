import { Router } from 'express'
import { protect, adminOnly } from '../../../core/middleware/auth.js'
import {
  getLandingToolsSettings,
  updateLandingToolsSettings,
} from '../controllers/admin.landingTools.controller.js'

const router = Router()

// Public read (can also be called without token)
router.get('/public', getLandingToolsSettings)

// Admin protected routes
router.get('/', protect, adminOnly, getLandingToolsSettings)
router.put('/', protect, adminOnly, updateLandingToolsSettings)

export default router

