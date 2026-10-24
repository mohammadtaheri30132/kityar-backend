import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IQuizFriendship extends Document {
  requester: Types.ObjectId
  recipient: Types.ObjectId
  status: 'pending' | 'accepted' | 'declined' | 'blocked'
  createdAt?: Date
  updatedAt?: Date
}

export interface IQuizChallenge extends Document {
  challengeId: string
  challenger: Types.ObjectId
  challenged: Types.ObjectId
  category?: string
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  matchId?: string
  createdAt?: Date
  expiresAt: Date
}

const quizFriendshipSchema = new Schema<IQuizFriendship>(
  {
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'blocked'], default: 'pending', index: true },
  },
  { timestamps: true }
)

quizFriendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true })

const quizChallengeSchema = new Schema<IQuizChallenge>(
  {
    challengeId: { type: String, required: true, unique: true },
    challenger: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    challenged: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'expired'], default: 'pending' },
    matchId: { type: String },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
)

export const QuizFriendship = mongoose.model<IQuizFriendship>('QuizFriendship', quizFriendshipSchema)
export const QuizChallenge = mongoose.model<IQuizChallenge>('QuizChallenge', quizChallengeSchema)
