// src/core/models/StudentProfile.ts
import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IScheduleItem {
  dayOfWeek: number // 0 (Saturday) to 5 (Thursday)
  bellNumber: number // 1 to 5
  subject: string
  teacherName?: string
  startTime?: string
  endTime?: string
  room?: string
  note?: string
}

export interface IStudyProgressEntry {
  itemType: 'book' | 'chapter' | 'lesson'
  itemId: Types.ObjectId
  stableId: string
  bookId: Types.ObjectId
  chapterId?: Types.ObjectId
  status: 'in_progress' | 'completed' | 'needs_review'
  mastery: number
  weakScore: number
  studyMinutes: number
  updatedAt: Date
}

export interface IStudentProfile extends Document {
  user: Types.ObjectId
  studentCode: string // شماره دانش‌آموزی یا کدملی برای ورود
  inviteCode?: string // کد اختصاصی دانش‌آموز برای دعوت دوستان
  invitedBy?: Types.ObjectId // معلمی که این دانش‌آموز را دعوت کرده
  invitedByStudent?: Types.ObjectId // کاربری که این دانش‌آموز با کد دعوت او وارد شده
  grade?: Types.ObjectId // پایه تحصیلی فعلی (قدیمی)
  eduLevelId?: Types.ObjectId // مقطع در بانک مرکزی نوکیتا
  eduGradeId?: Types.ObjectId // پایه در بانک مرکزی نوکیتا
  eduFieldId?: Types.ObjectId | null // رشته در بانک مرکزی نوکیتا
  selectedBookIds?: Types.ObjectId[] // کتاب‌های انتخاب‌شده
  studyProgress?: IStudyProgressEntry[] // سوابق مطالعاتی (با تغییر پایه/کتاب حفظ می‌شود)
  teachers: Types.ObjectId[] // لیست معلم‌هایی که این دانش‌آموز را به کلاس خود اضافه کرده‌اند
  weeklySchedule?: IScheduleItem[] // برنامه هفتگی مدرسه
}

const studentProfileSchema = new Schema<IStudentProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    studentCode: {
      type: String,
      unique: true,
    },
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    invitedByStudent: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    grade: {
      type: Schema.Types.ObjectId,
      ref: 'Grade',
    },
    eduLevelId: {
      type: Schema.Types.ObjectId,
      ref: 'EduLevel',
    },
    eduGradeId: {
      type: Schema.Types.ObjectId,
      ref: 'EduGrade',
    },
    eduFieldId: {
      type: Schema.Types.ObjectId,
      ref: 'EduField',
      default: null,
    },
    selectedBookIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'EduBook',
      },
    ],
    studyProgress: [
      {
        itemType: { type: String, enum: ['book', 'chapter', 'lesson'], required: true },
        itemId: { type: Schema.Types.ObjectId, required: true },
        stableId: { type: String, required: true },
        bookId: { type: Schema.Types.ObjectId, ref: 'EduBook', required: true },
        chapterId: { type: Schema.Types.ObjectId, ref: 'EduChapter' },
        status: { type: String, enum: ['in_progress', 'completed', 'needs_review'], default: 'in_progress' },
        mastery: { type: Number, default: 0 },
        weakScore: { type: Number, default: 0 },
        studyMinutes: { type: Number, default: 0 },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    teachers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'TeacherProfile',
      },
    ],
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'TeacherProfile',
    },
    weeklySchedule: [
      {
        dayOfWeek: { type: Number, required: true },
        bellNumber: { type: Number, required: true },
        subject: { type: String, default: '' },
        teacherName: { type: String, default: '' },
        startTime: { type: String, default: '' },
        endTime: { type: String, default: '' },
        room: { type: String, default: '' },
        note: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true }
)

export const StudentProfile = mongoose.model<IStudentProfile>('StudentProfile', studentProfileSchema)