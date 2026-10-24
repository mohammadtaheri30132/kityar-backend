import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IInventoryItem {
  itemId: string
  itemType: 'avatar' | 'frame' | 'theme' | 'hint_bundle'
  purchasedAt: Date
}

export interface IQuizProfile extends Document {
  user: Types.ObjectId
  studentCode?: string
  coins: number
  hearts: number
  lastHeartRegen: Date
  xp: number
  level: number
  avatar: string
  frame: string
  title: string
  totalMatches: number
  wins: number
  losses: number
  draws: number
  winStreak: number
  bestStreak: number
  totalCorrect: number
  totalAnswered: number
  recordModeBest: number
  dailyStreak: number
  lastDailyClaim?: Date
  inventory: IInventoryItem[]
  favoriteCategories: string[]
  isRestricted: boolean
  createdAt?: Date
  updatedAt?: Date
}

const inventoryItemSchema = new Schema<IInventoryItem>({
  itemId: { type: String, required: true },
  itemType: { type: String, enum: ['avatar', 'frame', 'theme', 'hint_bundle'], required: true },
  purchasedAt: { type: Date, default: Date.now },
}, { _id: false })

const quizProfileSchema = new Schema<IQuizProfile>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    studentCode: { type: String },
    coins: { type: Number, default: 200 },
    hearts: { type: Number, default: 5 },
    lastHeartRegen: { type: Date, default: Date.now },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    avatar: { type: String, default: 'avatar_student_1' },
    frame: { type: String, default: 'default' },
    title: { type: String, default: 'نوآموز کوییز' },
    totalMatches: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    winStreak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    totalCorrect: { type: Number, default: 0 },
    totalAnswered: { type: Number, default: 0 },
    recordModeBest: { type: Number, default: 0 },
    dailyStreak: { type: Number, default: 0 },
    lastDailyClaim: { type: Date },
    inventory: { type: [inventoryItemSchema], default: [] },
    favoriteCategories: { type: [String], default: [] },
    isRestricted: { type: Boolean, default: false },
  },
  { timestamps: true }
)

quizProfileSchema.index({ xp: -1 })
quizProfileSchema.index({ wins: -1 })
quizProfileSchema.index({ recordModeBest: -1 })

export const QuizProfile = mongoose.model<IQuizProfile>('QuizProfile', quizProfileSchema)
