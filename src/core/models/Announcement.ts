import mongoose, { Document, Schema } from 'mongoose'

export interface IAnnouncement extends Document {
  title: string
  shortMessage: string
  description?: string
  startDate: string
  endDate: string
  priority: 'low' | 'normal' | 'high'
  active: boolean
  createdAt: Date
  updatedAt: Date
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: {
      type: String,
      required: [true, 'عنوان اطلاعیه الزامی است'],
      trim: true,
    },
    shortMessage: {
      type: String,
      required: [true, 'پیام کوتاه الزامی است'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    startDate: {
      type: String,
      required: true,
      index: true,
    },
    endDate: {
      type: String,
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal',
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

export const Announcement = mongoose.model<IAnnouncement>('Announcement', announcementSchema)
