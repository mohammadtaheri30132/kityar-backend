import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IClassSession extends Document {
  classId: Types.ObjectId
  teacherId: Types.ObjectId
  subject: string
  date: string // e.g. "1402/07/15"
  status: 'PENDING' | 'COMPLETED'
  createdAt: Date
}

const classSessionSchema = new Schema<IClassSession>(
  {
    classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, default: 'عمومی' },
    date: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
  },
  { timestamps: true }
)

export const ClassSession = mongoose.model<IClassSession>('ClassSession', classSessionSchema)
