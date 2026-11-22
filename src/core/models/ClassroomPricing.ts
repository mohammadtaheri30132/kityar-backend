import mongoose, { Schema, Document } from 'mongoose'

export interface IDurationPrices {
  d15: number
  d30: number
  d45: number
  d60: number
  d75: number
  d90: number
}

export interface IOnlineClassSessionPolicy {
  unlockBeforeMinutes: number
  teacherGraceMinutes: number
  extraMinutes: number
  endWarningMinutes: number
  chatOpenHoursAfterEnd: number
  teacherRules: string[]
  studentRules: string[]
}

export const DEFAULT_CLASSROOM_POLICY: IOnlineClassSessionPolicy = {
  unlockBeforeMinutes: 5,
  teacherGraceMinutes: 30,
  extraMinutes: 5,
  endWarningMinutes: 5,
  chatOpenHoursAfterEnd: 24,
  teacherRules: [
    'حضور به موقع در کلاس آنلاین در ساعت مقرر الزامی است (حداکثر تاخیر مجاز ۳۰ دقیقه می‌باشد).',
    'روشن بودن میکروفون و ابزارهای صوتی/تصویری مناسب جهت تفهیم درس الزامی است.',
    'در صورت تاخیر معلم، زمان کلاس از لحظه ورود محاسبه شده و با احتساب ۵ دقیقه اضافه اینترنت تمدید می‌گردد.',
    'رعایت کامل اخلاق و شئونات آموزشی در تمام طول جلسه کلاس آنلاین الزامی است.',
  ],
  studentRules: [
    'ورود به کلاس آنلاین از ۵ دقیقه قبل از شروع با باز شدن درب کلاس امکان‌پذیر است.',
    'در صورت عدم حضور معلم تا ۳۰ دقیقه پس از ساعت مقرر، کلاس خودکار لغو شده و هزینه به کیف پول شما مسترد می‌گردد.',
    'لینک اختصاصی ورود به کلاس تک‌کاربره است و ورود از دستگاه دیگر باعث خروج دستگاه قبلی می‌شود.',
    'امکان ارتباط و چت با معلم تا ۲۴ ساعت پس از پایان کلاس فعال بوده و سپس بسته می‌شود.',
  ],
}

export interface IClassroomPricing extends Document {
  key: string
  isFree: boolean
  only90Min: boolean
  durationPrices: IDurationPrices
  extraStudentPrice: number
  recordingRetentionHours: number
  autoRecordEnabled: boolean
  sessionPolicy: IOnlineClassSessionPolicy
  createdAt: Date
  updatedAt: Date
}

const classroomPricingSchema = new Schema<IClassroomPricing>(
  {
    key: { type: String, default: 'default', unique: true, index: true },
    isFree: { type: Boolean, default: false },
    only90Min: { type: Boolean, default: false },
    durationPrices: {
      d15: { type: Number, default: 15000 },
      d30: { type: Number, default: 25000 },
      d45: { type: Number, default: 35000 },
      d60: { type: Number, default: 40000 },
      d75: { type: Number, default: 45000 },
      d90: { type: Number, default: 50000 },
    },
    extraStudentPrice: { type: Number, default: 50000 },
    recordingRetentionHours: { type: Number, default: 48 },
    autoRecordEnabled: { type: Boolean, default: true },
    sessionPolicy: {
      unlockBeforeMinutes: { type: Number, default: 5, min: 0 },
      teacherGraceMinutes: { type: Number, default: 30, min: 0 },
      extraMinutes: { type: Number, default: 5, min: 0 },
      endWarningMinutes: { type: Number, default: 5, min: 0 },
      chatOpenHoursAfterEnd: { type: Number, default: 24, min: 0 },
      teacherRules: {
        type: [String],
        default: () => [...DEFAULT_CLASSROOM_POLICY.teacherRules],
      },
      studentRules: {
        type: [String],
        default: () => [...DEFAULT_CLASSROOM_POLICY.studentRules],
      },
    },
  },
  { timestamps: true }
)

export const ClassroomPricing =
  mongoose.models.ClassroomPricing ||
  mongoose.model<IClassroomPricing>('ClassroomPricing', classroomPricingSchema)

