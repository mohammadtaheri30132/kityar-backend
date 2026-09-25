// src/core/models/StudentProfile.ts
import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IStudentProfile extends Document {
  user: Types.ObjectId
  studentCode: string // شماره دانش‌آموزی یا کدملی برای ورود
  grade: Types.ObjectId // پایه تحصیلی فعلی
  teachers: Types.ObjectId[] // لیست معلم‌هایی که این دانش‌آموز را به کلاس خود اضافه کرده‌اند
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
    //   required: [true, 'کد دانش‌آموزی/کدملی الزامی است'],
      unique: true,
    },
    grade: {
      type: Schema.Types.ObjectId,
      ref: 'Grade',
    //   required: [true, 'پایه تحصیلی الزامی است'],
    },
    
    teachers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'TeacherProfile',
      },
    ],
  },
  { timestamps: true }
)

export const StudentProfile = mongoose.model<IStudentProfile>('StudentProfile', studentProfileSchema)