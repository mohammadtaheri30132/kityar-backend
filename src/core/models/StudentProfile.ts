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

export interface IStudentProfile extends Document {
  user: Types.ObjectId
  studentCode: string // شماره دانش‌آموزی یا کدملی برای ورود
  inviteCode?: string // کد اختصاصی دانش‌آموز برای دعوت دوستان
  invitedBy?: Types.ObjectId // معلمی که این دانش‌آموز را دعوت کرده
  invitedByStudent?: Types.ObjectId // کاربری که این دانش‌آموز با کد دعوت او وارد شده
  grade?: Types.ObjectId // پایه تحصیلی فعلی
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