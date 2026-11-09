import mongoose, { Document, Schema } from 'mongoose'

export interface ILandingToolsSettings extends Document {
  key: string
  sectionTitle: string
  sectionSubtitle: string
  featuredToolIds: string[]
  updatedAt?: Date
}

const landingToolsSettingsSchema = new Schema<ILandingToolsSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    sectionTitle: {
      type: String,
      default: 'جعبه‌ابزار کاربردی معلمان در وب',
    },
    sectionSubtitle: {
      type: String,
      default:
        'مجموعه ابزارهای هوشمند تحت وب برای تبدیل فرمت فایل‌ها، اسکن و شفاف‌سازی برگه‌های امتحانی و کاهش حجم اسناد بدون افت کیفیت.',
    },
    featuredToolIds: {
      type: [String],
      default: ['format-converter', 'photo-scanner', 'file-compressor'],
    },
  },
  { timestamps: true }
)

export const LandingToolsSettings =
  mongoose.models.LandingToolsSettings ||
  mongoose.model<ILandingToolsSettings>(
    'LandingToolsSettings',
    landingToolsSettingsSchema
  )

export default LandingToolsSettings

