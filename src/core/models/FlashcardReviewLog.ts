import mongoose, { Schema, Document } from 'mongoose'

export interface IFlashcardReviewLog extends Document {
  userId: mongoose.Types.ObjectId
  clientId: string
  cardClientId: string
  deckClientId: string
  quality: 0 | 1 | 2 | 3
  elapsedMs: number
  xpEarned: number
  reviewedAt: number
}

const flashcardReviewLogSchema = new Schema<IFlashcardReviewLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String, required: true },
    cardClientId: { type: String, required: true, index: true },
    deckClientId: { type: String, required: true },
    quality: { type: Number, enum: [0, 1, 2, 3], required: true },
    elapsedMs: { type: Number, default: 0 },
    xpEarned: { type: Number, default: 0 },
    reviewedAt: { type: Number, required: true, index: true },
  },
  { timestamps: false }
)

flashcardReviewLogSchema.index({ userId: 1, clientId: 1 }, { unique: true })

export const FlashcardReviewLog = mongoose.model<IFlashcardReviewLog>('FlashcardReviewLog', flashcardReviewLogSchema)
