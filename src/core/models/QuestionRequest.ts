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
  type: 'image' | 'voice' | 'file'
  url: string
  duration?: number // For voice in seconds
  fileName?: string
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
  subjectId?: Types.ObjectId
  attachments: IQuestionAttachment[]
  status: QuestionStatus
  conversationId?: Types.ObjectId
  price: number // in Tomans
  answerSummary?: string
  answeredAt?: Date
  createdAt: Date
  updatedAt: Date
}

const attachmentSchema = new Schema(
  {
    type: { type: String, enum: ['image', 'voice', 'file'], required: true },
    url: { type: String, required: true },
    duration: { type: Number },
    fileName: { type: String },
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
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
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
  },
  { timestamps: true }
)

questionRequestSchema.index({ status: 1, isBroadcast: 1, createdAt: -1 })

export const QuestionRequest = mongoose.model<IQuestionRequest>('QuestionRequest', questionRequestSchema)
