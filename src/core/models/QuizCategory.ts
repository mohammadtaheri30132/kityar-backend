import mongoose, { Document, Schema } from 'mongoose'

export interface IQuizCategory extends Document {
  name: string
  icon: string
  color: string
  isActive: boolean
  order: number
  createdAt?: Date
  updatedAt?: Date
}

const quizCategorySchema = new Schema<IQuizCategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    icon: { type: String, default: '💡', trim: true },
    color: { type: String, default: '#3B82F6', trim: true },
    isActive: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
)

export const QuizCategory = mongoose.model<IQuizCategory>('QuizCategory', quizCategorySchema)

const DEFAULT_QUIZ_CATEGORIES = [
  { name: 'جغرافیا', icon: '🌍', color: '#9B59B6', order: 1 },
  { name: 'ورزشی', icon: '🏆', color: '#E67E22', order: 2 },
  { name: 'اطلاعات عمومی', icon: '💡', color: '#3B82F6', order: 3 },
  { name: 'موسیقی', icon: '🎵', color: '#EC4899', order: 4 },
  { name: 'تاریخ', icon: '🏛️', color: '#8B5CF6', order: 5 },
  { name: 'زبان انگلیسی', icon: '📚', color: '#2ECC71', order: 6 },
  { name: 'بازی‌های ویدئویی', icon: '🎮', color: '#2980B9', order: 7 },
  { name: 'سینما', icon: '🎬', color: '#F59E0B', order: 8 },
  { name: 'علمی', icon: '🔬', color: '#10B981', order: 9 },
]

export async function ensureDefaultQuizCategories(): Promise<void> {
  const count = await QuizCategory.countDocuments()
  if (count === 0) {
    await QuizCategory.insertMany(DEFAULT_QUIZ_CATEGORIES, { ordered: false }).catch(() => {})
  }
}
