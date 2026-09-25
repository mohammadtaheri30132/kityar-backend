import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IBook extends Document {
  name: string
  grade: Types.ObjectId
  order: number
  isActive: boolean
  totalQuestions: number
  icon: string
}

const bookSchema = new Schema<IBook>(
  {
    name: {
      type: String,
      required: [true, 'نام درس الزامی است'],
      trim: true,
    },
    grade: {
      type: Schema.Types.ObjectId,
      ref: 'Grade',
      required: [true, 'پایه الزامی است'],
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
    icon: {
      type: String,
      default: '📖',
    },
  },
  {
    timestamps: true,
  }
)

bookSchema.index({ grade: 1, order: 1 })
bookSchema.index({ grade: 1, name: 1 }, { unique: true })

export const Book = mongoose.model<IBook>('Book', bookSchema)
