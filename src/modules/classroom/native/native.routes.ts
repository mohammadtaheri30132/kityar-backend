import { Router } from 'express'
import { NativeClassroomController } from './native.controller.js'
import { AuthAdapter } from '../adapters/AuthAdapter.js'

const router = Router()

// Public / Authenticated Room Info
router.get('/rooms/:roomId/info', NativeClassroomController.getRoomInfo)
router.get('/rooms/:roomId/active-state', NativeClassroomController.getActiveState)
router.get('/ice-servers', NativeClassroomController.getIceServers)

// Protected endpoints
router.post('/rooms', AuthAdapter.authenticate, NativeClassroomController.createRoom)
router.post('/rooms/:roomId/tickets', AuthAdapter.authenticate, NativeClassroomController.createTicket)

export default router

