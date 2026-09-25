import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IField extends Document {
  name: string
  course: Types.ObjectId
  order: number
  isActive: boolean
}

const fieldSchema = new Schema<IField>(
  {
    name: {
      type: String,
      required: [true, 'نام رشته الزامی است'],
      trim: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'دوره الزامی است'],
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

fieldSchema.index({ course: 1, name: 1 }, { unique: true })

export const Field = mongoose.model<IField>('Field', fieldSchema)
