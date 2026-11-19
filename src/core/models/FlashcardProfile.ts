import mongoose, { Schema, Document } from 'mongoose'

export interface IFlashcardProfile extends Document {
  userId: mongoose.Types.ObjectId
  dailyGoal: number
  newCardsLimit: number
  currentStreak: number
  longestStreak: number
  lastStudyDate?: string
  xp: number
  weeklyXp: number
  level: number
  badges: string[]
  preferredGrades: string[]
  preferredSubjects: string[]
  preferredStudyHour: number
  darkMode: boolean
  dyslexiaFont: boolean
  fontScale: number
  soundEnabled: boolean
  onboardingCompleted: boolean
  updatedAtMs: number
}

const flashcardProfileSchema = new Schema<IFlashcardProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    dailyGoal: { type: Number, default: 20 },
    newCardsLimit: { type: Number, default: 15 },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastStudyDate: { type: String },
    xp: { type: Number, default: 0 },
    weeklyXp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    badges: [{ type: String }],
    preferredGrades: [{ type: String }],
    preferredSubjects: [{ type: String }],
    preferredStudyHour: { type: Number, default: 19 },
    darkMode: { type: Boolean, default: false },
    dyslexiaFont: { type: Boolean, default: false },
    fontScale: { type: Number, default: 1 },
    soundEnabled: { type: Boolean, default: true },
    onboardingCompleted: { type: Boolean, default: false },
    updatedAtMs: { type: Number, default: () => Date.now() },
  },
  { timestamps: true }
)

export const FlashcardProfile = mongoose.model<IFlashcardProfile>('FlashcardProfile', flashcardProfileSchema)
