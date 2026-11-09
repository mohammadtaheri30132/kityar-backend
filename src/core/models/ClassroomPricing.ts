import mongoose, { Schema, Document } from 'mongoose'

export interface IDurationPrices {
  d15: number
  d30: number
  d45: number
  d60: number
  d75: number
  d90: number
}

export interface IClassroomPricing extends Document {
  key: string
  isFree: boolean
  only90Min: boolean
  durationPrices: IDurationPrices
  extraStudentPrice: number
  createdAt: Date
  updatedAt: Date
}

const classroomPricingSchema = new Schema<IClassroomPricing>(
  {
    key: { type: String, default: 'default', unique: true, index: true },
    isFree: { type: Boolean, default: false },
    only90Min: { type: Boolean, default: false },
    durationPrices: {
      d15: { type: Number, default: 15000 },
      d30: { type: Number, default: 25000 },
      d45: { type: Number, default: 35000 },
      d60: { type: Number, default: 40000 },
      d75: { type: Number, default: 45000 },
      d90: { type: Number, default: 50000 },
    },
    extraStudentPrice: { type: Number, default: 50000 },
  },
  { timestamps: true }
)

export const ClassroomPricing =
  mongoose.models.ClassroomPricing ||
  mongoose.model<IClassroomPricing>('ClassroomPricing', classroomPricingSchema)

