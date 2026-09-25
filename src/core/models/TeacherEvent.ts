import mongoose, { Document, Schema } from 'mongoose'

export interface ITeacherEvent extends Document {
  teacherId: mongoose.Types.ObjectId
  title: string
  type: 'general' | 'meeting' | 'exam' | 'workshop' | 'personal' | 'school_event' | 'other'
  date: string // Storing as YYYY-MM-DD or Jalali YYYY-MM-DD string for easier querying if needed, or JS Date. Let's use string for Jalali consistency or JS Date? The prompt mentions "date: 18" in mock but standard representation in DB. Let's use Date for actual storage.
  startTime: string // HH:mm format
  endTime: string // HH:mm format
  schoolId?: mongoose.Types.ObjectId
  classId?: mongoose.Types.ObjectId
  location?: string
  description?: string
  color?: string
  createdAt: Date
  updatedAt: Date
}

const teacherEventSchema = new Schema<ITeacherEvent>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'عنوان رویداد الزامی است'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['general', 'meeting', 'exam', 'workshop', 'personal', 'school_event', 'other'],
      default: 'general',
    },
    date: {
      type: String, // Store normalized date string like '1405-07-25' or '2026-10-17' for exact day matching
      required: true,
      index: true,
    },
    startTime: {
      type: String,
      trim: true,
    },
    endTime: {
      type: String,
      trim: true,
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School', // Will create later
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: 'TeacherClass', // Will create later
    },
    location: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
)

export const TeacherEvent = mongoose.model<ITeacherEvent>('TeacherEvent', teacherEventSchema)
