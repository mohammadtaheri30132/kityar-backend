import { Router } from 'express'
import { protect } from '../../../core/middleware/auth.js'
import { StudentMarketplaceController } from '../controllers/student.marketplace.controller.js'
import { StudentOnlineClassController } from '../controllers/student.onlineClass.controller.js'

const router = Router()

// All student marketplace endpoints require login
router.use(protect)

// Teacher Discovery Directory & Public Profile
router.get('/teachers', StudentMarketplaceController.getTeachers)
router.get('/teachers/:id', StudentMarketplaceController.getTeacherPublicProfile)
router.post('/teachers/:id/reviews', StudentMarketplaceController.submitReview)

// Questions (Direct & Broadcast)
router.post('/questions', StudentMarketplaceController.submitQuestion)
router.get('/questions', StudentMarketplaceController.getMyQuestions)

// Materials Marketplace
router.get('/materials', StudentMarketplaceController.getMaterials)
router.get('/materials/my-purchases', StudentMarketplaceController.getMyPurchasedMaterials)
router.post('/materials/:id/purchase', StudentMarketplaceController.purchaseMaterial)
router.get('/materials/:id/download', StudentMarketplaceController.downloadMaterial)

// Online Classes (Marketplace broadcast)
router.get('/classes', StudentMarketplaceController.getClasses)
router.post('/classes/:id/register', StudentMarketplaceController.registerClass)

// Online Class 1-on-1 & Group Booking Flow
router.get('/online-classes/academic-hierarchy', StudentOnlineClassController.getAcademicHierarchy)
router.post('/online-classes/available-teachers', StudentOnlineClassController.getAvailableTeachers)
router.post('/online-classes/quote', StudentOnlineClassController.calculateQuote)
router.post('/online-classes/book', StudentOnlineClassController.createBooking)
router.get('/online-classes/my-bookings', StudentOnlineClassController.getMyBookings)
router.get('/online-classes/bookings/:id', StudentOnlineClassController.getBookingDetails)
router.post('/online-classes/bookings/:id/invite', StudentOnlineClassController.inviteFriend)
router.post('/online-classes/bookings/:id/cancel', StudentOnlineClassController.cancelBooking)

// Student Wallet
router.get('/wallet', StudentMarketplaceController.getWallet)

export default router
