import mongoose, { Document, Schema } from 'mongoose'

export interface IBlogMedia extends Document {
  filename: string
  originalName: string
  url: string
  mimeType: string
  size: number
  title: string
  alt: string
  caption: string
  uploadedBy?: mongoose.Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

const blogMediaSchema = new Schema<IBlogMedia>(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, default: 'image/jpeg' },
    size: { type: Number, default: 0 },
    title: { type: String, default: '', trim: true },
    alt: { type: String, default: '', trim: true },
    caption: { type: String, default: '', trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

blogMediaSchema.index({ createdAt: -1 })

export const BlogMedia =
  mongoose.models.BlogMedia || mongoose.model<IBlogMedia>('BlogMedia', blogMediaSchema)
export default BlogMedia

