// src/core/models/TeacherProfile.ts
import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IExperience {
  id: string
  title: string
  school: string
  location?: string
  startDate: string
  endDate?: string
  isCurrent?: boolean
  description?: string
}

export interface IEducation {
  id: string
  degree: string
  field: string
  university: string
  startDate?: string
  endDate?: string
  grade?: string
}

export interface ICertificate {
  id: string
  title: string
  issuer: string
  year?: string
  hours?: string
}

export interface IHonor {
  id: string
  title: string
  issuer: string
  year?: string
  type?: string
}

export interface ITeacherResume {
  experiences: IExperience[]
  education: IEducation[]
  skills: string[]
  certificates: ICertificate[]
  honors: IHonor[]
}

export interface ITeacherProfile extends Document {
  user: Types.ObjectId
  category: 'آموزگار' | 'دبیر' | 'هنرآموز'
  position: 'معلم' | 'مدیر' | 'معاون'
  schools: string[] // نام مدارسی که در آن‌ها تدریس می‌کند
  headline?: string
  bio?: string
  avatar?: string
  city?: string
  province?: string
  experienceYears?: number
  resume: ITeacherResume
  isActive: boolean
}

const experienceSchema = new Schema(
  {
    id: { type: String, default: () => new Types.ObjectId().toString() },
    title: { type: String, required: true },
    school: { type: String, required: true },
    location: { type: String, default: '' },
    startDate: { type: String, required: true },
    endDate: { type: String, default: '' },
    isCurrent: { type: Boolean, default: false },
    description: { type: String, default: '' },
  },
  { _id: false }
)

const educationSchema = new Schema(
  {
    id: { type: String, default: () => new Types.ObjectId().toString() },
    degree: { type: String, required: true },
    field: { type: String, required: true },
    university: { type: String, required: true },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    grade: { type: String, default: '' },
  },
  { _id: false }
)

const certificateSchema = new Schema(
  {
    id: { type: String, default: () => new Types.ObjectId().toString() },
    title: { type: String, required: true },
    issuer: { type: String, required: true },
    year: { type: String, default: '' },
    hours: { type: String, default: '' },
  },
  { _id: false }
)

const honorSchema = new Schema(
  {
    id: { type: String, default: () => new Types.ObjectId().toString() },
    title: { type: String, required: true },
    issuer: { type: String, required: true },
    year: { type: String, default: '' },
    type: { type: String, default: 'تقدیرنامه' },
  },
  { _id: false }
)

const resumeSchema = new Schema(
  {
    experiences: { type: [experienceSchema], default: [] },
    education: { type: [educationSchema], default: [] },
    skills: { type: [String], default: [] },
    certificates: { type: [certificateSchema], default: [] },
    honors: { type: [honorSchema], default: [] },
  },
  { _id: false }
)

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
      default: 'آموزگار',
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
    headline: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: '',
    },
    avatar: {
      type: String,
      default: '',
    },
    city: {
      type: String,
      default: '',
    },
    province: {
      type: String,
      default: '',
    },
    experienceYears: {
      type: Number,
      default: 0,
    },
    resume: {
      type: resumeSchema,
      default: () => ({
        experiences: [],
        education: [],
        skills: [],
        certificates: [],
        honors: [],
      }),
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export const TeacherProfile = mongoose.model<ITeacherProfile>('TeacherProfile', teacherProfileSchema)