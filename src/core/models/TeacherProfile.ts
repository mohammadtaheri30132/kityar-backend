// src/core/models/TeacherProfile.ts
import mongoose, { Document, Schema, Types } from 'mongoose'

export interface ITeacherProfile extends Document {
  user: Types.ObjectId
  category: 'آموزگار' | 'دبیر' | 'هنرآموز'
  position: 'معلم' | 'مدیر' | 'معاون'
  schools: string[] // نام مدارسی که در آن‌ها تدریس می‌کند
  isActive: boolean
}

const teacherProfileSchema = new Schema<ITeacherProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    category: {
      type: String,
      enum: ['آموزگار', 'دبیر', 'هنرآموز'],
      required: [true, 'نوع فعالیت معلم الزامی است'],
    },
    position: {
      type: String,
      enum: ['معلم', 'مدیر', 'معاون'],
      default: 'معلم',
    },
    schools: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export const TeacherProfile = mongoose.model<ITeacherProfile>('TeacherProfile', teacherProfileSchema)