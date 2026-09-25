import mongoose, { Document, Schema } from 'mongoose'

export interface IDailyNote extends Document {
  teacherId: mongoose.Types.ObjectId
  date: string // e.g., '1405-07-25'
  title?: string
  content: string
  color?: string
  createdAt: Date
  updatedAt: Date
}

const dailyNoteSchema = new Schema<IDailyNote>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'متن یادداشت الزامی است'],
      trim: true,
    },
    color: {
      type: String,
      default: '#fef08a' // Default yellow pastel
    },
  },
  {
    timestamps: true,
  }
)

export const DailyNote = mongoose.model<IDailyNote>('DailyNote', dailyNoteSchema)
