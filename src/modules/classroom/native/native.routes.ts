import express, { Router } from 'express'
import { NativeClassroomController } from './native.controller.js'
import { AuthAdapter } from '../adapters/AuthAdapter.js'

const router = Router()

// Public / Authenticated Room Info & Registration Form
router.get('/rooms/:roomId/info', NativeClassroomController.getRoomInfo)
router.get('/rooms/:roomId/active-state', NativeClassroomController.getActiveState)
router.post('/rooms/:roomId/register', NativeClassroomController.registerAttendee)
router.get('/ice-servers', NativeClassroomController.getIceServers)

// Seminar Attendance & Developer Load Telemetry Reports
router.get('/rooms/:roomId/attendance-report', AuthAdapter.authenticate, NativeClassroomController.getAttendanceReport)
router.get('/rooms/:roomId/telemetry-report', AuthAdapter.authenticate, NativeClassroomController.getRoomTelemetryReport)
router.get('/telemetry/server', AuthAdapter.authenticate, NativeClassroomController.getServerTelemetryReport)

// Classroom Recording & Synchronized Replay
router.get('/rooms/:roomId/recording', NativeClassroomController.getRecording)
router.post('/rooms/:roomId/recording/start', NativeClassroomController.startRecording)
router.post('/rooms/:roomId/recording/stop', NativeClassroomController.stopRecording)
router.post(
  '/rooms/:roomId/recording/chunk',
  express.raw({ type: () => true, limit: '50mb' }),
  NativeClassroomController.uploadRecordingChunk
)
router.delete('/rooms/:roomId/recording', AuthAdapter.authenticate, NativeClassroomController.deleteRecording)

// Protected endpoints
router.post('/rooms', AuthAdapter.authenticate, NativeClassroomController.createRoom)
router.post('/rooms/:roomId/tickets', AuthAdapter.authenticate, NativeClassroomController.createTicket)

export default router

