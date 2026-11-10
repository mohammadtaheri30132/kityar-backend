import { Router } from 'express'
import { protect } from '../../../core/middleware/auth.js'
import { TeacherCenterController } from '../controllers/teacher.center.controller.js'
import { TeacherOnlineClassController } from '../controllers/teacher.onlineClass.controller.js'

const router = Router()

// All routes require authentication
router.use(protect)

// Overview & Presence
router.get('/overview', TeacherCenterController.getOverview)
router.post('/availability', TeacherCenterController.updateAvailability)
router.post('/heartbeat', TeacherCenterController.heartbeat)

// Attendance
router.get('/attendance', TeacherCenterController.getAttendance)
router.post('/attendance', TeacherCenterController.setDailyAttendance)

// Student Requests & Q&A
router.get('/requests', TeacherCenterController.getRequests)
router.post('/requests/:id/claim-and-chat', TeacherCenterController.claimAndAcceptRequest)
router.post('/requests/:id/claim', TeacherCenterController.claimRequest)
router.post('/requests/:id/accept', TeacherCenterController.acceptRequest)
router.post('/requests/:id/reject', TeacherCenterController.rejectRequest)
router.post('/requests/:id/answer', TeacherCenterController.answerRequest)

// Educational Materials Marketplace
router.get('/materials', TeacherCenterController.getMaterials)
router.post('/materials', TeacherCenterController.createMaterial)
router.delete('/materials/:id', TeacherCenterController.deleteMaterial)

// Online Classes Broadcast
router.get('/classes', TeacherCenterController.getClasses)
router.post('/classes', TeacherCenterController.createClass)
router.delete('/classes/:id', TeacherCenterController.deleteClass)

// Online Class Settings & Bookings
router.get('/online-class-settings', TeacherOnlineClassController.getSettings)
router.post('/online-class-settings', TeacherOnlineClassController.updateSettings)
router.get('/class-requests', TeacherOnlineClassController.getClassRequests)
router.post('/class-requests/:id/accept', TeacherOnlineClassController.acceptRequest)
router.post('/class-requests/:id/reject', TeacherOnlineClassController.rejectRequest)
router.post('/class-requests/:id/complete', TeacherOnlineClassController.completeClass)

// Virtual Classroom & Online Class Reservation by Teacher
router.post('/virtual-classroom', TeacherCenterController.createVirtualClassroom)
router.post('/reserve-online-class', TeacherCenterController.reserveOnlineClassSession)
router.put('/workdesk-settings', TeacherCenterController.updateWorkDeskSettings)

// Wallet & Ledger
router.get('/wallet', TeacherCenterController.getWallet)

// Reviews
router.get('/reviews', TeacherCenterController.getReviews)

export default router
