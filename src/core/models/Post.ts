import mongoose, { Document, Schema } from 'mongoose'

export interface IPostFaq {
  question: string
  answer: string
}

export interface IPostSeo {
  focusKeyword: string
  metaTitle: string
  metaDescription: string
  canonicalUrl: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  robotsNoIndex: boolean
  robotsNoFollow: boolean
  schemaType: 'BlogPosting' | 'Article' | 'NewsArticle'
  seoScore: number
}

export interface IPost extends Document {
  title: string
  slug: string
  excerpt: string
  content: string
  coverImage: string
  coverImageAlt: string
  category: string
  tags: string[]
  author: {
    name: string
    role: string
    avatar?: string
  }
  readingTime: number
  views: number
  isFeatured: boolean
  isPublished: boolean
  publishedAt: Date
  targetAudience?: 'kitayar' | 'nokita' | 'all'
  seo: IPostSeo
  faqs: IPostFaq[]
  createdAt?: Date
  updatedAt?: Date
}

const postSchema = new Schema<IPost>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    excerpt: { type: String, required: true, default: '' },
    content: { type: String, required: true },
    coverImage: { type: String, default: '' },
    coverImageAlt: { type: String, default: '' },
    category: { type: String, required: true, default: 'آموزشی' },
    tags: { type: [String], default: [] },
    author: {
      name: { type: String, default: 'تحریریه کیتایار' },
      role: { type: String, default: 'کارشناس آموزش و یادگیری' },
      avatar: { type: String, default: '' },
    },
    readingTime: { type: Number, default: 5 },
    views: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    publishedAt: { type: Date, default: () => new Date() },
    targetAudience: {
      type: String,
      enum: ['kitayar', 'nokita', 'all'],
      default: 'kitayar',
      index: true,
    },
    seo: {
      focusKeyword: { type: String, default: '' },
      metaTitle: { type: String, default: '' },
      metaDescription: { type: String, default: '' },
      canonicalUrl: { type: String, default: '' },
      ogTitle: { type: String, default: '' },
      ogDescription: { type: String, default: '' },
      ogImage: { type: String, default: '' },
      robotsNoIndex: { type: Boolean, default: false },
      robotsNoFollow: { type: Boolean, default: false },
      schemaType: {
        type: String,
        enum: ['BlogPosting', 'Article', 'NewsArticle'],
        default: 'BlogPosting',
      },
      seoScore: { type: Number, default: 0 },
    },
    faqs: {
      type: [
        {
          question: { type: String, required: true },
          answer: { type: String, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
)

postSchema.index({ category: 1 })
postSchema.index({ isPublished: 1, publishedAt: -1 })
postSchema.index({ isFeatured: 1, publishedAt: -1 })

export const Post = mongoose.models.Post || mongoose.model<IPost>('Post', postSchema)
export default Post

