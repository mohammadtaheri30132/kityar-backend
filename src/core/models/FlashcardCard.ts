import mongoose, { Schema, Document } from 'mongoose'

export type FlashcardType = 'basic' | 'cloze' | 'mcq' | 'image' | 'audio'

export interface IFlashcardCard extends Document {
  userId: mongoose.Types.ObjectId
  clientId: string
  deckClientId: string
  cardType: FlashcardType
  frontText: string
  backShortAnswer: string
  backTip?: string
  textbookRef?: string
  frontImage?: string
  backImage?: string
  audioPath?: string
  options: string[]
  correctOptionIndex?: number
  tags: string[]
  ease: number
  intervalDays: number
  dueAt: number
  repetitions: number
  lapses: number
  lastReviewedAt?: number
  isDeleted: boolean
  updatedAtMs: number
}

const flashcardCardSchema = new Schema<IFlashcardCard>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String, required: true },
    deckClientId: { type: String, required: true, index: true },
    cardType: { type: String, enum: ['basic', 'cloze', 'mcq', 'image', 'audio'], default: 'basic' },
    frontText: { type: String, required: true, trim: true, maxlength: 2000 },
    backShortAnswer: { type: String, required: true, trim: true, maxlength: 2000 },
    backTip: { type: String, trim: true, maxlength: 2000 },
    textbookRef: { type: String, trim: true, maxlength: 200 },
    frontImage: { type: String },
    backImage: { type: String },
    audioPath: { type: String },
    options: [{ type: String, trim: true }],
    correctOptionIndex: { type: Number },
    tags: [{ type: String, trim: true }],
    ease: { type: Number, default: 2.5 },
    intervalDays: { type: Number, default: 0 },
    dueAt: { type: Number, default: () => Date.now(), index: true },
    repetitions: { type: Number, default: 0 },
    lapses: { type: Number, default: 0 },
    lastReviewedAt: { type: Number },
    isDeleted: { type: Boolean, default: false },
    updatedAtMs: { type: Number, default: () => Date.now(), index: true },
  },
  { timestamps: true }
)

flashcardCardSchema.index({ userId: 1, clientId: 1 }, { unique: true })
flashcardCardSchema.index({ userId: 1, deckClientId: 1, dueAt: 1 })

export const FlashcardCard = mongoose.model<IFlashcardCard>('FlashcardCard', flashcardCardSchema)
