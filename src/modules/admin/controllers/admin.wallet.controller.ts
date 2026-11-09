import { Request, Response } from 'express'
import { User } from '../../../core/models/User.js'
import { Wallet } from '../../../core/models/Wallet.js'
import { WalletTransaction } from '../../../core/models/WalletTransaction.js'
import { WalletService } from '../../../core/services/wallet.service.js'

export class AdminWalletController {
  /**
   * GET /api/admin/wallets/users
   * Search users and get their wallet balance
   */
  static async searchUsers(req: Request, res: Response) {
    try {
      const { search, role } = req.query

      const query: any = {}
      if (role && role !== 'all') {
        query.role = role
      }

      if (search && typeof search === 'string') {
        const regex = new RegExp(search.trim(), 'i')
        query.$or = [{ fullName: regex }, { phoneNumber: regex }, { username: regex }]
      }

      const users = await User.find(query).select('fullName phoneNumber username role').limit(30)

      const userIds = users.map((u) => u._id)
      const wallets = await Wallet.find({ userId: { $in: userIds } })
      const walletMap = new Map(wallets.map((w) => [w.userId.toString(), w]))

      const results = users.map((u) => {
        const wallet = walletMap.get(u._id.toString())
        return {
          id: u._id,
          fullName: u.fullName,
          phoneNumber: u.phoneNumber,
          username: u.username,
          role: u.role,
          wallet: {
            balance: wallet ? wallet.balance : 0,
            totalEarned: wallet ? wallet.totalEarned : 0,
            totalSpent: wallet ? wallet.totalSpent : 0,
            isFrozen: wallet ? wallet.isFrozen : false,
          },
        }
      })

      return res.json({ success: true, data: results })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/admin/wallets/adjust
   * Manually credit or debit a user wallet
   */
  static async adjustWallet(req: Request, res: Response) {
    try {
      const adminId = (req as any).user?._id
      const { userId, amount, action, reason, adminNotes } = req.body

      const numAmount = Number(amount)
      if (!userId || !numAmount || numAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'شناسه کاربر و مبلغ معتبر الزامی است',
        })
      }

      const user = await User.findById(userId)
      if (!user) {
        return res.status(404).json({ success: false, message: 'کاربر مورد نظر یافت نشد' })
      }

      const userType = user.role === 'student' ? 'student' : 'teacher'

      let result
      if (action === 'debit') {
        result = await WalletService.debit({
          userId,
          userType,
          amount: numAmount,
          type: 'admin_debit',
          description: reason || 'کسر موجودی توسط مدیریت سیستم',
          adminNotes: adminNotes || `انجام شده توسط ادمین: ${adminId}`,
        })
      } else {
        result = await WalletService.credit({
          userId,
          userType,
          amount: numAmount,
          type: 'admin_credit',
          description: reason || 'افزایش موجودی توسط مدیریت سیستم',
          adminNotes: adminNotes || `شارژ شده توسط ادمین: ${adminId}`,
        })
      }

      return res.json({
        success: true,
        message:
          action === 'debit'
            ? `مبلغ ${numAmount.toLocaleString()} تومان با موفقیت از حساب کسر شد.`
            : `مبلغ ${numAmount.toLocaleString()} تومان با موفقیت به حساب کاربر واریز شد.`,
        data: result,
      })
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || 'خطا در عملیات مالی' })
    }
  }

  /**
   * GET /api/admin/wallets/transactions
   * Transaction ledger audit log
   */
  static async getTransactions(req: Request, res: Response) {
    try {
      const { userId, type, limit } = req.query

      const query: any = {}
      if (userId) query.userId = userId
      if (type && type !== 'all') query.type = type

      const transactions = await WalletTransaction.find(query)
        .populate('userId', 'fullName phoneNumber username role')
        .sort({ createdAt: -1 })
        .limit(Number(limit) || 100)

      return res.json({ success: true, data: transactions })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  /**
   * POST /api/admin/wallets/:userId/toggle-freeze
   */
  static async toggleFreeze(req: Request, res: Response) {
    try {
      const { userId } = req.params
      const wallet = await Wallet.findOne({ userId })
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'کیف پول یافت نشد' })
      }

      wallet.isFrozen = !wallet.isFrozen
      await wallet.save()

      return res.json({
        success: true,
        message: wallet.isFrozen ? 'کیف پول مسدود شد' : 'انسداد کیف پول برداشته شد',
        data: wallet,
      })
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }
}
