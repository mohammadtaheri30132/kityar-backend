import mongoose, { Document, Schema, Types } from 'mongoose'

export type MessageType = 'text' | 'image' | 'voice' | 'file' | 'video'

export interface IMessage extends Document {
  conversationId: Types.ObjectId
  senderId: Types.ObjectId
  content: string
  type: MessageType
  mediaUrl?: string
  mediaDuration?: number // For audio/voice in seconds
  fileSize?: number
  fileName?: string
  status: 'sent' | 'delivered' | 'read'
  readBy: Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      default: '',
      trim: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'voice', 'file', 'video'],
      default: 'text',
    },
    mediaUrl: { type: String, trim: true },
    mediaDuration: { type: Number, default: 0 },
    fileSize: { type: Number, default: 0 },
    fileName: { type: String, trim: true },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
)

messageSchema.index({ conversationId: 1, createdAt: 1 })

export const Message = mongoose.model<IMessage>('Message', messageSchema)
