import mongoose, { Document, Schema } from 'mongoose'

export interface IChallengeQuestion {
  frontText: string
  backShortAnswer: string
  options: string[]
  correctOptionIndex: number
}

export interface IFlashcardChallenge extends Document {
  code: string
  deckTitle: string
  creatorId: mongoose.Types.ObjectId
  creatorName: string
  creatorScore: number
  creatorTimeMs: number
  opponentId?: mongoose.Types.ObjectId
  opponentName?: string
  opponentScore?: number
  opponentTimeMs?: number
  questions: IChallengeQuestion[]
  status: 'open' | 'completed'
  winnerId?: mongoose.Types.ObjectId
  expiresAt: Date
}

const flashcardChallengeSchema = new Schema<IFlashcardChallenge>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, index: true },
    deckTitle: { type: String, required: true, trim: true, maxlength: 120 },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    creatorName: { type: String, required: true },
    creatorScore: { type: Number, required: true, min: 0 },
    creatorTimeMs: { type: Number, required: true, min: 0 },
    opponentId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    opponentName: { type: String },
    opponentScore: { type: Number },
    opponentTimeMs: { type: Number },
    questions: [
      {
        frontText: { type: String, required: true },
        backShortAnswer: { type: String, required: true },
        options: [{ type: String, required: true }],
        correctOptionIndex: { type: Number, required: true },
      },
    ],
    status: { type: String, enum: ['open', 'completed'], default: 'open', index: true },
    winnerId: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  },
  { timestamps: true }
)

export const FlashcardChallenge = mongoose.model<IFlashcardChallenge>(
  'FlashcardChallenge',
  flashcardChallengeSchema
)
