import mongoose, { Document, Schema, Types } from 'mongoose'

export type QuestionStatus =
  | 'pending'
  | 'claimed'
  | 'accepted'
  | 'in_progress'
  | 'answered'
  | 'rejected'
  | 'closed'

export interface IQuestionAttachment {
  type: 'image' | 'voice' | 'file' | 'video'
  url: string
  duration?: number // For voice/video in seconds
  fileName?: string
  fileSize?: number
}

export interface IQuestionObjection {
  hasObjection: boolean
  reason?: string
  filedAt?: Date
  status: 'pending' | 'resolved_refund' | 'resolved_paid'
  adminNotes?: string
  resolvedAt?: Date
  resolvedBy?: Types.ObjectId
}

export interface IQuestionRequest extends Document {
  studentId: Types.ObjectId
  teacherId?: Types.ObjectId // Optional if broadcast
  targetTeacherIds?: Types.ObjectId[] // For multiple specific teachers
  isBroadcast: boolean
  claimedBy?: Types.ObjectId // For atomic claiming by a teacher
  claimedAt?: Date
  title: string
  description: string
  gradeId?: Types.ObjectId
  gradeName?: string
  subjectId?: Types.ObjectId
  subjectName?: string
  educationLevel?: 'elementary' | 'secondary'
  attachments: IQuestionAttachment[]
  status: QuestionStatus
  conversationId?: Types.ObjectId
  price: number // in Tomans
  answerSummary?: string
  answeredAt?: Date
  waitingExpiresAt?: Date
  cannotCancelBefore?: Date
  chatRetentionUntil?: Date
  payoutStatus: 'none' | 'pending_review' | 'approved' | 'rejected' | 'refunded'
  payoutEligibleAt?: Date
  payoutPaidAt?: Date
  objection?: IQuestionObjection
  createdAt: Date
  updatedAt: Date
}

const attachmentSchema = new Schema(
  {
    type: { type: String, enum: ['image', 'voice', 'file', 'video'], required: true },
    url: { type: String, required: true },
    duration: { type: Number },
    fileName: { type: String },
    fileSize: { type: Number },
  },
  { _id: false }
)

const objectionSchema = new Schema(
  {
    hasObjection: { type: Boolean, default: false },
    reason: { type: String, trim: true },
    filedAt: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'resolved_refund', 'resolved_paid'],
      default: 'pending',
    },
    adminNotes: { type: String, trim: true },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
)

const questionRequestSchema = new Schema<IQuestionRequest>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    targetTeacherIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isBroadcast: { type: Boolean, default: false, index: true },
    claimedBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    claimedAt: { type: Date },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    gradeId: { type: Schema.Types.ObjectId, ref: 'Grade' },
    gradeName: { type: String, trim: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    subjectName: { type: String, trim: true },
    educationLevel: { type: String, enum: ['elementary', 'secondary'] },
    attachments: { type: [attachmentSchema], default: [] },
    status: {
      type: String,
      enum: ['pending', 'claimed', 'accepted', 'in_progress', 'answered', 'rejected', 'closed'],
      default: 'pending',
      index: true,
    },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
    price: { type: Number, default: 0, min: 0 },
    answerSummary: { type: String, trim: true },
    answeredAt: { type: Date },
    waitingExpiresAt: { type: Date },
    cannotCancelBefore: { type: Date },
    chatRetentionUntil: { type: Date },
    payoutStatus: {
      type: String,
      enum: ['none', 'pending_review', 'approved', 'rejected', 'refunded'],
      default: 'none',
      index: true,
    },
    payoutEligibleAt: { type: Date },
    payoutPaidAt: { type: Date },
    objection: { type: objectionSchema, default: () => ({ hasObjection: false }) },
  },
  { timestamps: true }
)

questionRequestSchema.index({ status: 1, isBroadcast: 1, createdAt: -1 })

export const QuestionRequest = mongoose.model<IQuestionRequest>('QuestionRequest', questionRequestSchema)
