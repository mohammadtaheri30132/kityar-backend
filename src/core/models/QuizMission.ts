import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IQuizMission extends Document {
  missionId: string
  title: string
  description: string
  type: 'daily' | 'weekly'
  targetType: 'win_matches' | 'play_matches' | 'correct_answers' | 'category_match' | 'record_score' | 'friend_match'
  targetValue: number
  targetCategory?: string
  coinReward: number
  xpReward: number
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface IStudentMissionProgress extends Document {
  userId: Types.ObjectId
  missionId: string
  currentValue: number
  isCompleted: boolean
  isClaimed: boolean
  cycleDate: string // e.g. "2026-10-14" for daily or "2026-W42" for weekly
  updatedAt?: Date
}

const quizMissionSchema = new Schema<IQuizMission>(
  {
    missionId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, enum: ['daily', 'weekly'], default: 'daily' },
    targetType: {
      type: String,
      enum: ['win_matches', 'play_matches', 'correct_answers', 'category_match', 'record_score', 'friend_match'],
      required: true,
    },
    targetValue: { type: Number, required: true },
    targetCategory: { type: String },
    coinReward: { type: Number, default: 30 },
    xpReward: { type: Number, default: 50 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

const studentMissionProgressSchema = new Schema<IStudentMissionProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    missionId: { type: String, required: true, index: true },
    currentValue: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false },
    isClaimed: { type: Boolean, default: false },
    cycleDate: { type: String, required: true, index: true },
  },
  { timestamps: true }
)

studentMissionProgressSchema.index({ userId: 1, cycleDate: 1 })

export const QuizMission = mongoose.model<IQuizMission>('QuizMission', quizMissionSchema)
export const StudentMissionProgress = mongoose.model<IStudentMissionProgress>(
  'StudentMissionProgress',
  studentMissionProgressSchema
)
