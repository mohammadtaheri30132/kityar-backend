import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IGrade extends Document {
  name: string
  course: Types.ObjectId
  field: Types.ObjectId
  order: number
  isActive: boolean
  totalQuestions: number
}

const gradeSchema = new Schema<IGrade>(
  {
    name: {
      type: String,
      required: [true, 'نام پایه الزامی است'],
      trim: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'دوره الزامی است'],
    },
    field: {
      type: Schema.Types.ObjectId,
      ref: 'Field',
      required: [true, 'رشته الزامی است'],
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
  { timestamps: true }
)

// ایندکس ترکیبی: هر پایه برای یک رشته خاص در یک دوره یکتاست
gradeSchema.index({ course: 1, field: 1, name: 1 }, { unique: true })
gradeSchema.index({ course: 1, field: 1, order: 1 })

export const Grade = mongoose.model<IGrade>('Grade', gradeSchema)
