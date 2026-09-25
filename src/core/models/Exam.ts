import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IExam extends Document {
  teacher: Types.ObjectId
  classId?: Types.ObjectId // ارتباط آزمون با کلاس
  title: string
  description: string // قوانین و توضیحات دستی آزمون
  isUntimed: boolean; // 👈 این خط را اضافه کنید
  // زمان‌بندی و دسترسی
  startTime: Date // زمان باز شدن آزمون
  endTime: Date // زمان بسته شدن آزمون
  isActive: boolean // تعیین فعال بودن آزمون (امکان پایان دادن دستی)
  
  // لیست مجاز
  allowedParticipants: string[] // لیست شماره موبایل‌ها یا کدهای دانش‌آموزی مجاز
  
  // محتوای آزمون
  questions: Types.ObjectId[] // رفرنس به سوالاتی که از دیتابیس ادمین انتخاب شده
  totalScore: number // نمره کل امتحان
  
  // تنظیمات برگزاری
  randomizeQuestions: boolean // تصادفی کردن سوالات برای هر دانش‌آموز
  deliveryMode: 'all_at_once' | 'one_by_one' // ارسال یکجا یا تکی
  allowBackNavigation: boolean // قابل بازگشت بودن سوال (فقط در حالت تکی کاربرد دارد)
  questionsCount?: number // تعداد سوالات
}

const examSchema = new Schema<IExam>(
  {
    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'TeacherProfile',
      required: true,
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
    },
    isUntimed: { type: Boolean, default: false }, // 👈 این خط را اضافه کنید
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    
    // اینجا همون لیستی است که معلم تعریف میکنه
    allowedParticipants: { type: [String], default: [] },
    
    questions: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Question',
      },
    ],
    totalScore: { type: Number, required: true, default: 20 },
    
    // تنظیمات پیشرفته آزمون
    randomizeQuestions: { type: Boolean, default: false },
    deliveryMode: { 
      type: String, 
      enum: ['all_at_once', 'one_by_one'], 
      default: 'all_at_once' 
    },
    allowBackNavigation: { type: Boolean, default: true },
  },
  { timestamps: true }
)

export const Exam = mongoose.model<IExam>('Exam', examSchema)