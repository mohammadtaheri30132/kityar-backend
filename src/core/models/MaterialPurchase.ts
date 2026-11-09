import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IMaterialPurchase extends Document {
  materialId: Types.ObjectId
  studentId: Types.ObjectId
  pricePaid: number
  transactionId?: Types.ObjectId
  downloadToken: string
  downloadExpiresAt?: Date
  downloadCount: number
  createdAt: Date
  updatedAt: Date
}

const materialPurchaseSchema = new Schema<IMaterialPurchase>(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'TeacherMaterial', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pricePaid: { type: Number, default: 0 },
    transactionId: { type: Schema.Types.ObjectId, ref: 'WalletTransaction' },
    downloadToken: {
      type: String,
      required: true,
      unique: true,
      default: () => `DL-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
    },
    downloadExpiresAt: { type: Date },
    downloadCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

// One purchase record per student per material
materialPurchaseSchema.index({ studentId: 1, materialId: 1 }, { unique: true })

export const MaterialPurchase = mongoose.model<IMaterialPurchase>('MaterialPurchase', materialPurchaseSchema)
