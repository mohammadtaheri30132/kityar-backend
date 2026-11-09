import { Router } from 'express'
import { PlugNmeetController } from './PlugNmeetController.js'
import { AuthAdapter } from '../adapters/AuthAdapter.js'

const router = Router()

// Middleware allowing either valid Ticket/Token or JWT Auth
const optionalAuthOrTicket = async (req: any, res: any, next: any) => {
  const hasTicketOrIdentity = !!(
    req.body?.ticket ||
    req.body?.token ||
    req.query?.ticket ||
    req.query?.token ||
    req.body?.identity
  )
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

// 1. Create a plugNmeet classroom session (Teacher / Admin)
router.post('/create', AuthAdapter.authenticate, PlugNmeetController.createSession)

// 2. Get join token (supports both JWT user and guest with invite ticket)
router.get('/rooms/:sessionId/token', optionalAuthOrTicket, PlugNmeetController.getJoinToken)
router.post('/rooms/:sessionId/token', optionalAuthOrTicket, PlugNmeetController.getJoinToken)

// 3. Official Client JS & CSS files for Native Embedding
router.get('/client-files', PlugNmeetController.getClientFiles)

// 4. Live room status
router.get('/rooms/:sessionId/status', optionalAuthOrTicket, PlugNmeetController.getStatus)

// 5. Force end room (Teacher / Admin)
router.post('/rooms/:sessionId/end', AuthAdapter.authenticate, PlugNmeetController.endSession)

export default router

