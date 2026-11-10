import mongoose, { Document, Schema, Types } from 'mongoose'

export type MaterialFileType = 'pdf' | 'video' | 'audio' | 'zip' | 'document'
export type MaterialStatus = 'published' | 'draft' | 'under_review' | 'archived'

export interface ITeacherMaterial extends Document {
  teacherId: Types.ObjectId
  title: string
  description: string
  gradeId?: Types.ObjectId
  subjectId?: Types.ObjectId
  price: number // in Tomans (0 = free)
  coverImageUrl?: string
  previewFileUrl?: string // Demo/sample pages (watermarked or partial)
  introVideoUrl?: string
  previewImages?: string[]
  fullFileUrl: string // Full file (stored in protected path)
  fileType: MaterialFileType
  fileSize?: number // In bytes
  pageCount?: number
  salesCount: number
  totalEarnings: number
  rating: number
  ratingsCount: number
  status: MaterialStatus
  createdAt: Date
  updatedAt: Date
}

const teacherMaterialSchema = new Schema<ITeacherMaterial>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    gradeId: { type: Schema.Types.ObjectId, ref: 'Grade' },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    price: { type: Number, default: 0, min: 0 },
    coverImageUrl: { type: String, trim: true },
    previewFileUrl: { type: String, trim: true },
    introVideoUrl: { type: String, trim: true },
    previewImages: { type: [String], default: [] },
    fullFileUrl: { type: String, required: true, trim: true },
    fileType: {
      type: String,
      enum: ['pdf', 'video', 'audio', 'zip', 'document'],
      default: 'pdf',
    },
    fileSize: { type: Number, default: 0 },
    pageCount: { type: Number, default: 0 },
    salesCount: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0, min: 1, max: 5 },
    ratingsCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['published', 'draft', 'under_review', 'archived'],
      default: 'published',
      index: true,
    },
  },
  { timestamps: true }
)

teacherMaterialSchema.index({ status: 1, gradeId: 1, subjectId: 1 })
teacherMaterialSchema.index({ teacherId: 1, createdAt: -1 })

export const TeacherMaterial = mongoose.model<ITeacherMaterial>('TeacherMaterial', teacherMaterialSchema)
