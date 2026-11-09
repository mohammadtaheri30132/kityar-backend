import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IWallet extends Document {
  userId: Types.ObjectId
  userType: 'teacher' | 'student' | 'admin'
  balance: number // In Tomans
  totalEarned: number
  totalSpent: number
  isFrozen: boolean
  iban?: string
  bankAccountHolder?: string
  createdAt: Date
  updatedAt: Date
}

const walletSchema = new Schema<IWallet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    userType: { type: String, enum: ['teacher', 'student', 'admin'], required: true },
    balance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0, min: 0 },
    totalSpent: { type: Number, default: 0, min: 0 },
    isFrozen: { type: Boolean, default: false },
    iban: { type: String, trim: true },
    bankAccountHolder: { type: String, trim: true },
  },
  { timestamps: true }
)

export const Wallet = mongoose.model<IWallet>('Wallet', walletSchema)
