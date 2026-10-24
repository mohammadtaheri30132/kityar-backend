import mongoose, { Document, Schema } from 'mongoose'

export interface IQuizConfig extends Document {
  key: string
  roundsPerMatch: number
  questionsPerRound: number
  questionTimerSeconds: number
  maxHearts: number
  heartRegenMinutes: number
  winCoinReward: number
  drawCoinReward: number
  lossCoinReward: number
  winXpReward: number
  drawXpReward: number
  lossXpReward: number
  matchmakingTimeoutSeconds: number
  botEnabled: boolean
  botDistribution: {
    easy: number
    medium: number
    hard: number
  }
  botAccuracy: {
    easy: { easy: number; medium: number; hard: number }
    medium: { easy: number; medium: number; hard: number }
    hard: { easy: number; medium: number; hard: number }
  }
  botResponseDelay: {
    easy: { minMs: number; maxMs: number }
    medium: { minMs: number; maxMs: number }
    hard: { minMs: number; maxMs: number }
  }
  hintPrices: {
    removeTwo: number
    extraTime: number
    audiencePoll: number
    learningHint: number
  }
  updatedAt?: Date
}

const quizConfigSchema = new Schema<IQuizConfig>(
  {
    key: { type: String, default: 'global', unique: true },
    roundsPerMatch: { type: Number, default: 2 },
    questionsPerRound: { type: Number, default: 3 },
    questionTimerSeconds: { type: Number, default: 15 },
    maxHearts: { type: Number, default: 5 },
    heartRegenMinutes: { type: Number, default: 60 },
    winCoinReward: { type: Number, default: 50 },
    drawCoinReward: { type: Number, default: 20 },
    lossCoinReward: { type: Number, default: 10 },
    winXpReward: { type: Number, default: 100 },
    drawXpReward: { type: Number, default: 40 },
    lossXpReward: { type: Number, default: 20 },
    matchmakingTimeoutSeconds: { type: Number, default: 10 },
    botEnabled: { type: Boolean, default: true },
    botDistribution: {
      easy: { type: Number, default: 70 },
      medium: { type: Number, default: 25 },
      hard: { type: Number, default: 5 },
    },
    botAccuracy: {
      easy: {
        easy: { type: Number, default: 0.8 },
        medium: { type: Number, default: 0.3 },
        hard: { type: Number, default: 0.05 },
      },
      medium: {
        easy: { type: Number, default: 0.9 },
        medium: { type: Number, default: 0.65 },
        hard: { type: Number, default: 0.25 },
      },
      hard: {
        easy: { type: Number, default: 0.98 },
        medium: { type: Number, default: 0.88 },
        hard: { type: Number, default: 0.6 },
      },
    },
    botResponseDelay: {
      easy: {
        minMs: { type: Number, default: 4000 },
        maxMs: { type: Number, default: 11000 },
      },
      medium: {
        minMs: { type: Number, default: 3000 },
        maxMs: { type: Number, default: 8500 },
      },
      hard: {
        minMs: { type: Number, default: 2000 },
        maxMs: { type: Number, default: 6000 },
      },
    },
    hintPrices: {
      removeTwo: { type: Number, default: 20 },
      extraTime: { type: Number, default: 15 },
      audiencePoll: { type: Number, default: 25 },
      learningHint: { type: Number, default: 10 },
    },
  },
  { timestamps: true }
)

export const QuizConfig = mongoose.model<IQuizConfig>('QuizConfig', quizConfigSchema)
