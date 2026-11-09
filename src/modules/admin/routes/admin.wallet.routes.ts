import { Router } from 'express'
import { protect, adminOnly } from '../../../core/middleware/auth.js'
import { AdminWalletController } from '../controllers/admin.wallet.controller.js'

const router = Router()

// Admin only
router.use(protect)
router.use(adminOnly)

router.get('/users', AdminWalletController.searchUsers)
router.post('/adjust', AdminWalletController.adjustWallet)
router.get('/transactions', AdminWalletController.getTransactions)
router.post('/:userId/toggle-freeze', AdminWalletController.toggleFreeze)

export default router
