import mongoose, { Document, Schema, Types } from 'mongoose'

export type QuestionType = 'تستی' | 'جاخالی' | 'صحیح-غلط' | 'کوتاه-پاسخ' | 'گسترده-پاسخ' | 'جورکردنی' | 'انتخاب-کلمه'
export type Difficulty = 'ساده' | 'متوسط' | 'دشوار'
export type QuestionStatus = 'در-حال-بررسی' | 'تایید-شده' | 'مشکل-دار'

export interface ISubQuestion {
  sub_id: string
  type: QuestionType
  question: string
  options: string[]
  page_number: number[]
  answer: string
}

export interface IQuestion extends Document {
  question_id?: string
  book?: Types.ObjectId
  grade?: Types.ObjectId
  course?: Types.ObjectId
  type: QuestionType
  difficulty: Difficulty
  question: string
  mainQuestion: string
  options: string[]
  matching_left: string[]
  matching_right: string[]
  answer: string
  lesson_id?: number
  page_number: number[]
  source_image: string
  audioUrl?: string
  createdBy: Types.ObjectId
  isActive: boolean
  is_composite: boolean
  sub: ISubQuestion[]
  status: QuestionStatus
  tags: string[]
  has_image: boolean
  has_audio: boolean
    createdAt?: Date
  updatedAt?: Date
}

const subQuestionSchema = new Schema<ISubQuestion>({
  sub_id: { type: String },
  type: { type: String, enum: ['تستی', 'جاخالی', 'صحیح-غلط', 'کوتاه-پاسخ', 'گسترده-پاسخ', 'جورکردنی', 'انتخاب-کلمه'] },
  question: { type: String },
  options: { type: [String], default: [] },
  page_number: { type: [Number], default: [] },
  answer: { type: String, default: '' },
}, { _id: false })

const questionSchema = new Schema<IQuestion>(
  {
    question_id: { type: String },
    book: { type: Schema.Types.ObjectId, ref: 'Book' },
    grade: { type: Schema.Types.ObjectId, ref: 'Grade' },
    course: { type: Schema.Types.ObjectId, ref: 'Course' },
    type: { type: String, enum: ['تستی', 'جاخالی', 'صحیح-غلط', 'کوتاه-پاسخ', 'گسترده-پاسخ', 'جورکردنی', 'انتخاب-کلمه'], required: true },
    difficulty: { type: String, enum: ['ساده', 'متوسط', 'دشوار'], default: 'متوسط' },
    question: { type: String, required: true },
    mainQuestion: { type: String, default: '' },
    options: { type: [String], default: [] },
    matching_left: { type: [String], default: [] },
    matching_right: { type: [String], default: [] },
    answer: { type: String, default: '' },
    lesson_id: { type: Number },
    page_number: { type: [Number], default: [] },
    source_image: { type: String, default: '' },
    audioUrl: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true },
    is_composite: { type: Boolean, default: false },
    sub: { type: [subQuestionSchema], default: [] },
    status: { type: String, enum: ['در-حال-بررسی', 'تایید-شده', 'مشکل-دار'], default: 'در-حال-بررسی' },
    tags: { type: [String], default: [] },
    has_image: { type: Boolean, default: false },
    has_audio: { type: Boolean, default: false },
  },
  { timestamps: true }
)

questionSchema.index({ course: 1, grade: 1, book: 1 })
questionSchema.index({ type: 1 })
questionSchema.index({ status: 1 })
questionSchema.index({ tags: 1 })
questionSchema.index({ has_image: 1 })
questionSchema.index({ mainQuestion: 1 })

export const Question = mongoose.model<IQuestion>('Question', questionSchema)
