import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IAttendanceRecord extends Document {
  sessionId: Types.ObjectId
  classId: Types.ObjectId
  studentPhone: string
  status: 'PRESENT' | 'ABSENT_UNEXCUSED' | 'ABSENT_EXCUSED' | 'LATE'
  reason?: string // For excused absence
  createdAt: Date
}

const attendanceRecordSchema = new Schema<IAttendanceRecord>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'ClassSession', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
    studentPhone: { type: String, required: true, index: true },
    status: { 
      type: String, 
      enum: ['PRESENT', 'ABSENT_UNEXCUSED', 'ABSENT_EXCUSED', 'LATE'], 
      required: true 
    },
    reason: { type: String },
  },
  { timestamps: true }
)

// Ensure one record per student per session
attendanceRecordSchema.index({ sessionId: 1, studentPhone: 1 }, { unique: true })

export const AttendanceRecord = mongoose.model<IAttendanceRecord>('AttendanceRecord', attendanceRecordSchema)
