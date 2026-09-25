import mongoose, { Document, Schema } from 'mongoose'

export interface IWeeklySchedule extends Document {
  teacherId: mongoose.Types.ObjectId
  schoolId?: mongoose.Types.ObjectId
  classId?: mongoose.Types.ObjectId
  schoolName?: string
  className?: string
  subject?: string
  dayOfWeek: number // 0 (Saturday) to 6 (Friday)
  startTime: string
  endTime: string
  room?: string
  color?: string
  createdAt: Date
  updatedAt: Date
}

const weeklyScheduleSchema = new Schema<IWeeklySchedule>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: 'TeacherClass',
    },
    schoolName: {
      type: String,
      trim: true,
    },
    className: {
      type: String,
      trim: true,
    },
    subject: {
      type: String,
      trim: true,
    },
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    startTime: {
      type: String,
      default: ''
    },
    endTime: {
      type: String,
      default: ''
    },
    room: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
      default: '#3b82f6'
    }
  },
  {
    timestamps: true,
  }
)

export const WeeklySchedule = mongoose.model<IWeeklySchedule>('WeeklySchedule', weeklyScheduleSchema)
