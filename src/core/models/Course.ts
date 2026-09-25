import mongoose, { Document, Schema } from 'mongoose'

export interface ICourse extends Document {
  name: string
  code: string
  description: string
  order: number
  isActive: boolean
  totalQuestions: number
}

const courseSchema = new Schema<ICourse>(
  {
    name: {
      type: String,
      required: [true, 'نام دوره الزامی است'],
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      required: [true, 'کد دوره الزامی است'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    totalQuestions: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

// فقط ایندکس order - code و name خودشون unique هستن
courseSchema.index({ order: 1 })

export const Course = mongoose.model<ICourse>('Course', courseSchema)
