import mongoose, { Document, Schema, Types } from 'mongoose'

export type TransactionType =
  | 'match_reward'
  | 'record_reward'
  | 'hint_purchase'
  | 'store_purchase'
  | 'daily_reward'
  | 'mission_reward'
  | 'achievement_reward'
  | 'admin_adjustment'

export interface ICoinTransaction extends Document {
  userId: Types.ObjectId
  amount: number
  balanceAfter: number
  type: TransactionType
  idempotencyKey: string
  description: string
  referenceId?: string
  adminUser?: Types.ObjectId
  reason?: string
  createdAt?: Date
  updatedAt?: Date
}

const coinTransactionSchema = new Schema<ICoinTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    type: {
      type: String,
      enum: [
        'match_reward',
        'record_reward',
        'hint_purchase',
        'store_purchase',
        'daily_reward',
        'mission_reward',
        'achievement_reward',
        'admin_adjustment',
      ],
      required: true,
      index: true,
    },
    idempotencyKey: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    referenceId: { type: String },
    adminUser: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String },
  },
  { timestamps: true }
)

coinTransactionSchema.index({ userId: 1, createdAt: -1 })

export const CoinTransaction = mongoose.model<ICoinTransaction>('CoinTransaction', coinTransactionSchema)
