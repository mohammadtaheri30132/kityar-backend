import mongoose, { Document, Schema, Types } from 'mongoose'

export type WalletTxType =
  | 'admin_credit'
  | 'admin_debit'
  | 'material_purchase'
  | 'material_sale'
  | 'question_fee'
  | 'question_reward'
  | 'class_fee'
  | 'class_earning'
  | 'withdrawal'
  | 'deposit'

export interface IWalletTransaction extends Document {
  walletId: Types.ObjectId
  userId: Types.ObjectId
  amount: number // Positive for credits, negative for debits (in Tomans)
  balanceAfter: number
  type: WalletTxType
  status: 'completed' | 'pending' | 'failed' | 'cancelled'
  referenceId?: string
  referenceModel?: string
  description: string
  adminNotes?: string
  trackingCode: string
  idempotencyKey?: string
  createdAt: Date
  updatedAt: Date
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    type: {
      type: String,
      enum: [
        'admin_credit',
        'admin_debit',
        'material_purchase',
        'material_sale',
        'question_fee',
        'question_reward',
        'class_fee',
        'class_earning',
        'withdrawal',
        'deposit',
      ],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['completed', 'pending', 'failed', 'cancelled'],
      default: 'completed',
      index: true,
    },
    referenceId: { type: String, trim: true },
    referenceModel: { type: String, trim: true },
    description: { type: String, default: '' },
    adminNotes: { type: String, trim: true },
    trackingCode: {
      type: String,
      required: true,
      unique: true,
      default: () => `TX-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    },
    idempotencyKey: { type: String, sparse: true, unique: true },
  },
  { timestamps: true }
)

walletTransactionSchema.index({ userId: 1, createdAt: -1 })
walletTransactionSchema.index({ walletId: 1, createdAt: -1 })

export const WalletTransaction = mongoose.model<IWalletTransaction>('WalletTransaction', walletTransactionSchema)
