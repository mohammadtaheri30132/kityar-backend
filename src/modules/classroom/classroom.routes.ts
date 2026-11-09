import { Router } from 'express'
import { ClassroomController } from './controllers/classroom.controller.js'
import { PlugNmeetController } from './plugnmeet/PlugNmeetController.js'
import { AuthAdapter } from './adapters/AuthAdapter.js'
import plugnmeetRoutes from './plugnmeet/plugnmeet.routes.js'
import nativeRoutes from './native/native.routes.js'

const router = Router()

// Native WebRTC Classroom Routes
router.use('/native', nativeRoutes)

// plugNmeet Standalone Engine Routes
router.use('/plugnmeet', plugnmeetRoutes)

// Optional auth middleware for token: allow ticket or identity-based access without JWT
const optionalAuthOrTicket = async (req: any, res: any, next: any) => {
  const hasTicketOrIdentity = !!(req.body?.ticket || req.query?.ticket || req.body?.identity)
  if (hasTicketOrIdentity) {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      try {
        await AuthAdapter.authenticate(req, res, () => {})
      } catch (e) {
        // Ignore token errors if ticket or identity is supplied
      }
    }
    return next()
  }
  return AuthAdapter.authenticate(req, res, next)
}

// Protected classroom session endpoints (all using plugNmeet as unified engine)
router.get('/pricing', ClassroomController.getPricing)
router.put('/pricing', ClassroomController.updatePricing)
router.post('/pricing', ClassroomController.updatePricing)
router.get('/monitoring/sessions', AuthAdapter.authenticate, ClassroomController.listSessions)
router.post('/admin/create-session', AuthAdapter.authenticate, PlugNmeetController.createSession)
router.post('/rooms/:sessionId/tickets', AuthAdapter.authenticate, ClassroomController.addTickets)
router.get('/rooms/:sessionId/tickets', AuthAdapter.authenticate, ClassroomController.listTickets)
router.post('/rooms/:sessionId/token', optionalAuthOrTicket, PlugNmeetController.getJoinToken)
router.get('/rooms/:sessionId/token', optionalAuthOrTicket, PlugNmeetController.getJoinToken)
router.get('/rooms/:sessionId/status', AuthAdapter.authenticate, PlugNmeetController.getStatus)
router.post('/rooms/:sessionId/end', AuthAdapter.authenticate, PlugNmeetController.endSession)

export default router

