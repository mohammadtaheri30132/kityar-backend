import { Types } from 'mongoose'
import { Wallet, IWallet } from '../models/Wallet.js'
import { WalletTransaction, WalletTxType, IWalletTransaction } from '../models/WalletTransaction.js'

export class WalletService {
  /**
   * Get or automatically create a wallet for a user
   */
  static async getOrCreateWallet(
    userId: string | Types.ObjectId,
    userType: 'teacher' | 'student' | 'admin'
  ): Promise<IWallet> {
    let wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      wallet = await Wallet.create({
        userId,
        userType,
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
        isFrozen: false,
      })
    }
    return wallet
  }

  /**
   * Atomically credit an amount to user's wallet and write a ledger entry
   */
  static async credit(params: {
    userId: string | Types.ObjectId
    userType: 'teacher' | 'student' | 'admin'
    amount: number
    type: WalletTxType
    description: string
    referenceId?: string
    referenceModel?: string
    adminNotes?: string
    idempotencyKey?: string
  }): Promise<{ wallet: IWallet; transaction: IWalletTransaction }> {
    const {
      userId,
      userType,
      amount,
      type,
      description,
      referenceId,
      referenceModel,
      adminNotes,
      idempotencyKey,
    } = params

    if (amount <= 0) {
      throw new Error('مبلغ افزایش اعتبار باید بزرگتر از صفر باشد')
    }

    // Check idempotency if key provided
    if (idempotencyKey) {
      const existingTx = await WalletTransaction.findOne({ idempotencyKey })
      if (existingTx) {
        const wallet = await this.getOrCreateWallet(userId, userType)
        return { wallet, transaction: existingTx }
      }
    }

    // Ensure wallet exists
    await this.getOrCreateWallet(userId, userType)

    // Atomic increment
    const updatedWallet = await Wallet.findOneAndUpdate(
      { userId, isFrozen: false },
      {
        $inc: {
          balance: amount,
          totalEarned: type !== 'admin_credit' && type !== 'deposit' ? amount : 0,
        },
      },
      { new: true }
    )

    if (!updatedWallet) {
      throw new Error('کیف پول کاربر مسدود است یا یافت نشد')
    }

    const transaction = await WalletTransaction.create({
      walletId: updatedWallet._id,
      userId,
      amount,
      balanceAfter: updatedWallet.balance,
      type,
      status: 'completed',
      referenceId,
      referenceModel,
      description,
      adminNotes,
      idempotencyKey,
    })

    return { wallet: updatedWallet, transaction }
  }

  /**
   * Atomically debit an amount from user's wallet with balance check
   */
  static async debit(params: {
    userId: string | Types.ObjectId
    userType: 'teacher' | 'student' | 'admin'
    amount: number
    type: WalletTxType
    description: string
    referenceId?: string
    referenceModel?: string
    adminNotes?: string
    idempotencyKey?: string
  }): Promise<{ wallet: IWallet; transaction: IWalletTransaction }> {
    const {
      userId,
      userType,
      amount,
      type,
      description,
      referenceId,
      referenceModel,
      adminNotes,
      idempotencyKey,
    } = params

    if (amount <= 0) {
      throw new Error('مبلغ کسر از کیف پول باید بزرگتر از صفر باشد')
    }

    if (idempotencyKey) {
      const existingTx = await WalletTransaction.findOne({ idempotencyKey })
      if (existingTx) {
        const wallet = await this.getOrCreateWallet(userId, userType)
        return { wallet, transaction: existingTx }
      }
    }

    // Atomic debit ensuring balance >= amount
    const updatedWallet = await Wallet.findOneAndUpdate(
      {
        userId,
        isFrozen: false,
        balance: { $gte: amount },
      },
      {
        $inc: {
          balance: -amount,
          totalSpent: amount,
        },
      },
      { new: true }
    )

    if (!updatedWallet) {
      const currentWallet = await Wallet.findOne({ userId })
      if (!currentWallet) {
        throw new Error('کیف پول یافت نشد')
      }
      if (currentWallet.isFrozen) {
        throw new Error('کیف پول کاربر مسدود است')
      }
      throw new Error('موجودی کیف پول برای انجام این تراکنش کافی نیست')
    }

    const transaction = await WalletTransaction.create({
      walletId: updatedWallet._id,
      userId,
      amount: -amount,
      balanceAfter: updatedWallet.balance,
      type,
      status: 'completed',
      referenceId,
      referenceModel,
      description,
      adminNotes,
      idempotencyKey,
    })

    return { wallet: updatedWallet, transaction }
  }
}
