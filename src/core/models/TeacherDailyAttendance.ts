import mongoose, { Document, Schema, Types } from 'mongoose'

export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'remote'

export interface ITeacherDailyAttendance extends Document {
  teacherId: Types.ObjectId
  date: string // Format: YYYY-MM-DD (Persian or Gregorian)
  status: AttendanceStatus
  checkInTime?: Date
  checkOutTime?: Date
  plannedHours: number
  actualHours: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

const teacherDailyAttendanceSchema = new Schema<ITeacherDailyAttendance>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['present', 'absent', 'leave', 'remote'],
      default: 'present',
    },
    checkInTime: { type: Date },
    checkOutTime: { type: Date },
    plannedHours: { type: Number, default: 4 },
    actualHours: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
)

// Ensure one record per teacher per date
teacherDailyAttendanceSchema.index({ teacherId: 1, date: 1 }, { unique: true })

export const TeacherDailyAttendance = mongoose.model<ITeacherDailyAttendance>(
  'TeacherDailyAttendance',
  teacherDailyAttendanceSchema
)
