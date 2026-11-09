import mongoose, { Document, Schema } from 'mongoose'

export interface IBlogSeoSettings extends Document {
  key: string
  blogTitle: string
  blogSubtitle: string
  titleSeparator: string
  siteNameSuffix: string
  defaultMetaDescription: string
  defaultKeywords: string[]
  defaultOgImage: string
  googleSiteVerification: string
  bingSiteVerification: string
  defaultRobotsIndex: boolean
  defaultRobotsFollow: boolean
  categories: string[]
  organizationName: string
  ctaBoxTitle: string
  ctaBoxSubtitle: string
  ctaBoxButtonText: string
  ctaBoxButtonLink: string
  updatedAt?: Date
}

const blogSeoSettingsSchema = new Schema<IBlogSeoSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    blogTitle: {
      type: String,
      default: 'مجله تخصصی آموزش و فناوری کیتایار',
    },
    blogSubtitle: {
      type: String,
      default:
        'جدیدترین مقالات، استانداردهای طراحی سوال، روش‌های تدریس خلاق و مدیریت هوشمند کلاس درس ویژه معلمان ایران',
    },
    titleSeparator: { type: String, default: '|' },
    siteNameSuffix: { type: String, default: 'کیتایار' },
    defaultMetaDescription: {
      type: String,
      default:
        'مجله آموزشی کیتایار؛ مرجع تخصصی مقالات طراحی آزمون استاندارد، کلاس آنلاین تعاملی، ارزشیابی توصیفی و تکنولوژی آموزشی برای معلمان و مدارس.',
    },
    defaultKeywords: {
      type: [String],
      default: [
        'وبلاگ معلمان',
        'طراحی آزمون استاندارد',
        'مدیریت کلاس درس',
        'کلاس آنلاین تعاملی',
        'تکنولوژی آموزشی',
        'کیتایار',
      ],
    },
    defaultOgImage: { type: String, default: '/images/kitayar_logo.png' },
    googleSiteVerification: { type: String, default: '' },
    bingSiteVerification: { type: String, default: '' },
    defaultRobotsIndex: { type: Boolean, default: true },
    defaultRobotsFollow: { type: Boolean, default: true },
    categories: {
      type: [String],
      default: [
        'طراحی آزمون',
        'مدیریت کلاس',
        'تکنولوژی آموزشی',
        'ارزشیابی تحصیلی',
        'کلاس آنلاین',
        'مشاوره و انگیزش',
      ],
    },
    organizationName: { type: String, default: 'سامانه آموزشی کیتایار' },
    ctaBoxTitle: {
      type: String,
      default: 'به دنبال طراحی آزمون استاندارد یا برگزاری کلاس آنلاین هستید؟',
    },
    ctaBoxSubtitle: {
      type: String,
      default:
        'با ابزارهای وب کیتایار در کمتر از ۳ دقیقه آزمون آنلاین، فرم هوشمند یا برگه چاپی A4 بسازید.',
    },
    ctaBoxButtonText: { type: String, default: 'شروع رایگان در کیتایار' },
    ctaBoxButtonLink: { type: String, default: '/exam/create' },
  },
  { timestamps: true }
)

export const BlogSeoSettings =
  mongoose.models.BlogSeoSettings ||
  mongoose.model<IBlogSeoSettings>('BlogSeoSettings', blogSeoSettingsSchema)
export default BlogSeoSettings

