import mongoose, { Schema, Document } from 'mongoose'

export interface IFlashcardDeck extends Document {
  userId: mongoose.Types.ObjectId
  clientId: string
  title: string
  description?: string
  grade?: string
  subject?: string
  chapter?: string
  tags: string[]
  icon: string
  color: string
  isPinned: boolean
  isArchived: boolean
  isPublic: boolean
  shareCode?: string
  collabCode?: string
  ratingSum: number
  ratingCount: number
  usageCount: number
  ratedBy: Array<{ userId: mongoose.Types.ObjectId; rating: number }>
  reportedBy: mongoose.Types.ObjectId[]
  reportCount: number
  isHiddenByReport: boolean
  collaborators: mongoose.Types.ObjectId[]
  examDateMs?: number
  isDeleted: boolean
  updatedAtMs: number
}

const flashcardDeckSchema = new Schema<IFlashcardDeck>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 400 },
    grade: { type: String, trim: true },
    subject: { type: String, trim: true },
    chapter: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    icon: { type: String, default: '🃏' },
    color: { type: String, default: '#6366F1' },
    isPinned: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    isPublic: { type: Boolean, default: false, index: true },
    shareCode: { type: String, sparse: true, index: true },
    collabCode: { type: String, sparse: true, index: true },
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },
    ratedBy: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        rating: { type: Number, min: 1, max: 5, required: true },
      },
    ],
    reportedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reportCount: { type: Number, default: 0 },
    isHiddenByReport: { type: Boolean, default: false, index: true },
    collaborators: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    examDateMs: { type: Number },
    isDeleted: { type: Boolean, default: false },
    updatedAtMs: { type: Number, default: () => Date.now(), index: true },
  },
  { timestamps: true }
)

flashcardDeckSchema.index({ userId: 1, clientId: 1 }, { unique: true })
flashcardDeckSchema.index({ isPublic: 1, isDeleted: 1, updatedAtMs: -1 })

export const FlashcardDeck = mongoose.model<IFlashcardDeck>('FlashcardDeck', flashcardDeckSchema)
