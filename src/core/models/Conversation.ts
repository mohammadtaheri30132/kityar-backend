import mongoose, { Document, Schema, Types } from 'mongoose'

export type ConversationType = 'direct' | 'question' | 'class'

export interface IConversation extends Document {
  type: ConversationType
  participants: Types.ObjectId[]
  questionRequestId?: Types.ObjectId
  lastMessage?: string
  lastMessageAt?: Date
  lastMessageSender?: Types.ObjectId
  unreadCounts: Map<string, number>
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const conversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ['direct', 'question', 'class'],
      default: 'direct',
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    questionRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'QuestionRequest',
    },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessageSender: { type: Schema.Types.ObjectId, ref: 'User' },
    unreadCounts: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

conversationSchema.index({ participants: 1, updatedAt: -1 })

export const Conversation = mongoose.model<IConversation>('Conversation', conversationSchema)
