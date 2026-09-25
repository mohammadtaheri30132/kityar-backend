import mongoose, { Document, Schema } from 'mongoose'

export interface ISystemEvent extends Document {
  title: string
  type: 'holiday' | 'educational' | 'religious' | 'national' | 'school' | 'general'
  startDate: string // e.g. 1405-07-25
  endDate: string // e.g. 1405-07-25
  description?: string
  color?: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}

const systemEventSchema = new Schema<ISystemEvent>(
  {
    title: {
      type: String,
      required: [true, 'عنوان مناسبت الزامی است'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['holiday', 'educational', 'religious', 'national', 'school', 'general'],
      default: 'general',
    },
    startDate: {
      type: String,
      required: true,
      index: true,
    },
    endDate: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
)

export const SystemEvent = mongoose.model<ISystemEvent>('SystemEvent', systemEventSchema)
