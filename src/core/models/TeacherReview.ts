import mongoose, { Document, Schema, Types } from 'mongoose'

export type ReviewContextType = 'question' | 'class' | 'material' | 'general'

export interface ITeacherReview extends Document {
  teacherId: Types.ObjectId
  studentId: Types.ObjectId
  rating: number // 1 to 5
  comment: string
  voiceUrl?: string
  isComplaint?: boolean
  complaintText?: string
  complaintStatus?: 'none' | 'pending' | 'resolved'
  contextType: ReviewContextType
  contextId?: Types.ObjectId
  status: 'approved' | 'pending' | 'rejected'
  createdAt: Date
  updatedAt: Date
}

const teacherReviewSchema = new Schema<ITeacherReview>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', trim: true },
    voiceUrl: { type: String, trim: true },
    isComplaint: { type: Boolean, default: false },
    complaintText: { type: String, trim: true },
    complaintStatus: {
      type: String,
      enum: ['none', 'pending', 'resolved'],
      default: 'none',
    },
    contextType: {
      type: String,
      enum: ['question', 'class', 'material', 'general'],
      default: 'general',
    },
    contextId: { type: Schema.Types.ObjectId },
    status: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'approved',
      index: true,
    },
  },
  { timestamps: true }
)

teacherReviewSchema.index({ teacherId: 1, createdAt: -1 })

export const TeacherReview = mongoose.model<ITeacherReview>('TeacherReview', teacherReviewSchema)
