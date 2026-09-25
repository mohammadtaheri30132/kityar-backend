import mongoose, { Document, Schema, Types } from 'mongoose'

// اینترفیس برای پاسخ‌های هر سوال
export interface IAnswer {
  question: Types.ObjectId
  submittedAnswer: string | string[] // پاسخ ثبت شده (برای سوالات جورکردنی می‌تواند آرایه باشد)
  isCorrect?: boolean // تصحیح خودکار برای سوالات تستی
  earnedScore?: number // نمره‌ای که از این سوال گرفته
}

export interface IExamSession extends Document {
  exam: Types.ObjectId
  participantIdentifier: string // همان شماره موبایل یا کدی که معلم در لیست مجاز قرار داده بود
  user?: Types.ObjectId // اگر کاربر پروفایل داشته باشد، آیدی او هم ذخیره می‌شود
  
  // برای شرکت‌کنندگان ناشناس یا از طریق لینک
  firstNameSnapshot?: string
  lastNameSnapshot?: string
  matchingStatus: 'MATCHED' | 'NEEDS_REVIEW'

  status: 'in-progress' | 'finished' // وضعیت آزمون
  
  startTime: Date // زمان دقیق کلیک روی دکمه شروع
  finishTime?: Date // زمان دقیق پایان آزمون (دستی یا اتمام زمان)
  
  answers: IAnswer[] // لیست پاسخ‌هایی که تا این لحظه داده است
  totalEarnedScore: number // نمره کل کسب شده
  
  currentQuestionIndex: number // برای پیگیری اینکه کاربر در حالت "ارسال تکی" در کدام سوال است
}

const answerSchema = new Schema<IAnswer>(
  {
    question: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    submittedAnswer: { type: Schema.Types.Mixed, default: '' },
    isCorrect: { type: Boolean, default: false },
    earnedScore: { type: Number, default: 0 },
  },
  { _id: false } // نیازی به تولید آیدی مجزا برای هر پاسخ نیست
)

const examSessionSchema = new Schema<IExamSession>(
  {
    exam: {
      type: Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true,
    },
    participantIdentifier: {
      type: String,
      required: true,
      index: true, // برای جستجوی سریع نشست‌های یک دانش‌آموز
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    firstNameSnapshot: { type: String },
    lastNameSnapshot: { type: String },
    matchingStatus: {
      type: String,
      enum: ['MATCHED', 'NEEDS_REVIEW'],
      default: 'MATCHED'
    },
    status: {
      type: String,
      enum: ['in-progress', 'finished'],
      default: 'in-progress',
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    finishTime: {
      type: Date,
    },
    answers: {
      type: [answerSchema],
      default: [],
    },
    totalEarnedScore: {
      type: Number,
      default: 0,
    },
    gradingStatus: {
      type: String,
      enum: ['pending', 'graded'],
      default: 'pending', // به صورت پیش‌فرض در انتظار تصحیح است
    },
    currentQuestionIndex: {
      type: Number,
      default: 0, // به معلم نشان می‌دهد دانش‌آموز دقیقاً روی کدام سوال است
    },
  },
  { timestamps: true }
)

// هر دانش‌آموز فقط یک نشست فعال/پایان‌یافته برای هر آزمون می‌تواند داشته باشد
examSessionSchema.index({ exam: 1, participantIdentifier: 1 }, { unique: true })

export const ExamSession = mongoose.model<IExamSession>('ExamSession', examSessionSchema)