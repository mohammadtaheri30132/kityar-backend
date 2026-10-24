import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IQuizPlayerAnswer {
  questionIndex: number
  questionId: string
  selectedOption: string
  isCorrect: boolean
  responseTimeMs: number
  submittedAt: Date
}

export interface IQuizPlayerState {
  userId?: Types.ObjectId
  username: string
  fullName: string
  avatar: string
  score: number
  correctCount: number
  isBot: boolean
  botDifficulty?: 'easy' | 'medium' | 'hard'
  answers: IQuizPlayerAnswer[]
  hasFinishedCurrentQuestion?: boolean
}

export interface IQuizMatchQuestion {
  questionId: Types.ObjectId
  text: string
  options: string[]
  correctAnswer: string // Stored on server, never exposed in student get-match endpoint until question is over
  difficulty: 'ساده' | 'متوسط' | 'دشوار'
  category: string
  explanation?: string
}

export interface IQuizMatch extends Document {
  matchId: string
  mode: 'quick' | 'category' | 'friend' | 'class'
  category?: string
  status: 'waiting' | 'in_progress' | 'completed' | 'abandoned' | 'cancelled'
  player1: IQuizPlayerState
  player2: IQuizPlayerState
  rounds: number
  questionsPerRound: number
  totalQuestions: number
  currentQuestionIndex: number
  questions: IQuizMatchQuestion[]
  currentQuestionStartedAt: Date
  winner?: 'player1' | 'player2' | 'draw'
  player1RewardsGranted: boolean
  player2RewardsGranted: boolean
  completedAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

const quizPlayerAnswerSchema = new Schema<IQuizPlayerAnswer>(
  {
    questionIndex: { type: Number, required: true },
    questionId: { type: String, required: true },
    selectedOption: { type: String, required: true },
    isCorrect: { type: Boolean, required: true },
    responseTimeMs: { type: Number, required: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const quizPlayerStateSchema = new Schema<IQuizPlayerState>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    username: { type: String, required: true },
    fullName: { type: String, required: true },
    avatar: { type: String, default: 'avatar_student_1' },
    score: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    isBot: { type: Boolean, default: false },
    botDifficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
    answers: { type: [quizPlayerAnswerSchema], default: [] },
    hasFinishedCurrentQuestion: { type: Boolean, default: false },
  },
  { _id: false }
)

const quizMatchQuestionSchema = new Schema<IQuizMatchQuestion>(
  {
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    text: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswer: { type: String, required: true },
    difficulty: { type: String, enum: ['ساده', 'متوسط', 'دشوار'], default: 'متوسط' },
    category: { type: String, default: 'عمومی' },
    explanation: { type: String, default: '' },
  },
  { _id: false }
)

const quizMatchSchema = new Schema<IQuizMatch>(
  {
    matchId: { type: String, required: true, unique: true, index: true },
    mode: { type: String, enum: ['quick', 'category', 'friend', 'class'], default: 'quick' },
    category: { type: String },
    status: {
      type: String,
      enum: ['waiting', 'in_progress', 'completed', 'abandoned', 'cancelled'],
      default: 'waiting',
      index: true,
    },
    player1: { type: quizPlayerStateSchema, required: true },
    player2: { type: quizPlayerStateSchema, required: true },
    rounds: { type: Number, default: 2 },
    questionsPerRound: { type: Number, default: 3 },
    totalQuestions: { type: Number, default: 6 },
    currentQuestionIndex: { type: Number, default: 0 },
    questions: { type: [quizMatchQuestionSchema], default: [] },
    currentQuestionStartedAt: { type: Date, default: Date.now },
    winner: { type: String, enum: ['player1', 'player2', 'draw'] },
    player1RewardsGranted: { type: Boolean, default: false },
    player2RewardsGranted: { type: Boolean, default: false },
    completedAt: { type: Date },
  },
  { timestamps: true }
)

quizMatchSchema.index({ 'player1.userId': 1, createdAt: -1 })
quizMatchSchema.index({ 'player2.userId': 1, createdAt: -1 })

export const QuizMatch = mongoose.model<IQuizMatch>('QuizMatch', quizMatchSchema)
