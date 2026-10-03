import mongoose, { Document, Schema } from 'mongoose'

export interface ISchool extends Document {
  teacherId: mongoose.Types.ObjectId
  name: string
  address?: string
  schoolPhone?: string
  principalPhone?: string
  extraPhone?: string
  color?: string
  description?: string
  createdAt: Date
  updatedAt: Date
}

const schoolSchema = new Schema<ISchool>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'نام مدرسه الزامی است'],
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    schoolPhone: {
      type: String,
      trim: true,
    },
    principalPhone: {
      type: String,
      trim: true,
    },
    extraPhone: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
      default: '#3b82f6', // Default blue color
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
)

// Prevent a teacher from adding the exact same school twice
schoolSchema.index({ teacherId: 1, name: 1 }, { unique: true })

export const School = mongoose.model<ISchool>('School', schoolSchema)
