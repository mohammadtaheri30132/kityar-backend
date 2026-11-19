import mongoose, { Document, Schema, Types } from 'mongoose'

export type EduImageType = 'real_cover' | 'graphic' | 'placeholder' | 'none'
export type EduImageStatus = 'approved' | 'pending' | 'needs_image'
export type EduBookStructure = 'chapter' | 'lesson'

export interface IEduImage {
  url: string | null
  imageType: EduImageType
  source: string
  status: EduImageStatus
  updatedAt?: Date
}

const eduImageSchema = new Schema<IEduImage>(
  {
    url: { type: String, default: null },
    imageType: {
      type: String,
      enum: ['real_cover', 'graphic', 'placeholder', 'none'],
      default: 'none',
    },
    source: { type: String, default: 'none' },
    status: {
      type: String,
      enum: ['approved', 'pending', 'needs_image'],
      default: 'needs_image',
    },
    updatedAt: { type: Date },
  },
  { _id: false }
)

const DEFAULT_IMAGE: IEduImage = {
  url: null,
  imageType: 'none',
  source: 'none',
  status: 'needs_image',
}

export interface IEduLevel extends Document {
  stableId: string
  name: string
  code: string
  order: number
  isActive: boolean
  image: IEduImage
}

const eduLevelSchema = new Schema<IEduLevel>(
  {
    stableId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, default: '', trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    image: { type: eduImageSchema, default: () => ({ ...DEFAULT_IMAGE }) },
  },
  { timestamps: true }
)
eduLevelSchema.index({ order: 1 })

export interface IEduGrade extends Document {
  stableId: string
  name: string
  numericOrder: number
  levelId: Types.ObjectId
  order: number
  isActive: boolean
  image: IEduImage
}

const eduGradeSchema = new Schema<IEduGrade>(
  {
    stableId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    numericOrder: { type: Number, default: 0 },
    levelId: { type: Schema.Types.ObjectId, ref: 'EduLevel', required: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    image: { type: eduImageSchema, default: () => ({ ...DEFAULT_IMAGE }) },
  },
  { timestamps: true }
)
eduGradeSchema.index({ levelId: 1, order: 1 })

export interface IEduField extends Document {
  stableId: string
  name: string
  levelId: Types.ObjectId
  order: number
  isActive: boolean
  image: IEduImage
}

const eduFieldSchema = new Schema<IEduField>(
  {
    stableId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    levelId: { type: Schema.Types.ObjectId, ref: 'EduLevel', required: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    image: { type: eduImageSchema, default: () => ({ ...DEFAULT_IMAGE }) },
  },
  { timestamps: true }
)
eduFieldSchema.index({ levelId: 1, order: 1 })

export interface IEduBook extends Document {
  stableId: string
  title: string
  levelId: Types.ObjectId
  gradeId: Types.ObjectId
  fieldId: Types.ObjectId | null
  linkedQuestionBookId?: Types.ObjectId | null
  structure: EduBookStructure
  keywords: string[]
  order: number
  isActive: boolean
  image: IEduImage
}

const eduBookSchema = new Schema<IEduBook>(
  {
    stableId: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    levelId: { type: Schema.Types.ObjectId, ref: 'EduLevel', required: true },
    gradeId: { type: Schema.Types.ObjectId, ref: 'EduGrade', required: true },
    fieldId: { type: Schema.Types.ObjectId, ref: 'EduField', default: null },
    linkedQuestionBookId: { type: Schema.Types.ObjectId, ref: 'Book', default: null },
    structure: { type: String, enum: ['chapter', 'lesson'], required: true },
    keywords: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    image: { type: eduImageSchema, default: () => ({ ...DEFAULT_IMAGE }) },
  },
  { timestamps: true }
)
eduBookSchema.index({ levelId: 1, gradeId: 1, fieldId: 1, order: 1 })
eduBookSchema.index({ title: 'text', keywords: 'text' })

export interface IEduChapter extends Document {
  stableId: string
  bookId: Types.ObjectId
  jsonKey: string
  title: string
  keywords: string[]
  hasEmptyLessons: boolean
  order: number
  isActive: boolean
}

const eduChapterSchema = new Schema<IEduChapter>(
  {
    stableId: { type: String, required: true, unique: true, trim: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'EduBook', required: true },
    jsonKey: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    keywords: { type: [String], default: [] },
    hasEmptyLessons: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)
eduChapterSchema.index({ bookId: 1, order: 1 })

export interface IEduLesson extends Document {
  stableId: string
  bookId: Types.ObjectId
  chapterId: Types.ObjectId
  jsonKey: string
  title: string
  keywords: string[]
  order: number
  isActive: boolean
}

const eduLessonSchema = new Schema<IEduLesson>(
  {
    stableId: { type: String, required: true, unique: true, trim: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'EduBook', required: true },
    chapterId: { type: Schema.Types.ObjectId, ref: 'EduChapter', required: true },
    jsonKey: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    keywords: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)
eduLessonSchema.index({ bookId: 1, chapterId: 1, order: 1 })

export interface IEduBackupSnapshot extends Document {
  label: string
  reason: 'manual' | 'pre_replace' | 'pre_import' | 'pre_mass_delete'
  createdByName: string
  stats: {
    levels: number
    grades: number
    fields: number
    books: number
    chapters: number
    lessons: number
  }
  payload: any[]
  createdAt: Date
}

const eduBackupSnapshotSchema = new Schema<IEduBackupSnapshot>(
  {
    label: { type: String, required: true },
    reason: {
      type: String,
      enum: ['manual', 'pre_replace', 'pre_import', 'pre_mass_delete'],
      default: 'manual',
    },
    createdByName: { type: String, default: 'مدیر سیستم' },
    stats: {
      levels: { type: Number, default: 0 },
      grades: { type: Number, default: 0 },
      fields: { type: Number, default: 0 },
      books: { type: Number, default: 0 },
      chapters: { type: Number, default: 0 },
      lessons: { type: Number, default: 0 },
    },
    payload: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
)

export interface IEduAuditLog extends Document {
  action: 'create' | 'update' | 'delete' | 'reorder' | 'import' | 'restore' | 'image_update'
  entityType: 'level' | 'grade' | 'field' | 'book' | 'chapter' | 'lesson' | 'system'
  entityStableId?: string
  actorName: string
  summary: string
  details?: any
  createdAt: Date
}

const eduAuditLogSchema = new Schema<IEduAuditLog>(
  {
    action: {
      type: String,
      enum: ['create', 'update', 'delete', 'reorder', 'import', 'restore', 'image_update'],
      required: true,
    },
    entityType: {
      type: String,
      enum: ['level', 'grade', 'field', 'book', 'chapter', 'lesson', 'system'],
      required: true,
    },
    entityStableId: { type: String },
    actorName: { type: String, default: 'مدیر سیستم' },
    summary: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
)
eduAuditLogSchema.index({ createdAt: -1 })

export type EduResourceCategory = 'main_pdf' | 'step_by_step' | 'note' | 'video' | 'custom'
export type EduResourceContentType = 'pdf' | 'video' | 'text' | 'image' | 'link'

export interface IEduCustomSection extends Document {
  title: string
  description: string
  icon: string
  levelId: Types.ObjectId
  gradeId: Types.ObjectId | null
  fieldId: Types.ObjectId | null
  bookId: Types.ObjectId | null
  order: number
  isActive: boolean
}

const eduCustomSectionSchema = new Schema<IEduCustomSection>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    icon: { type: String, default: 'sparkles', trim: true },
    levelId: { type: Schema.Types.ObjectId, ref: 'EduLevel', required: true },
    gradeId: { type: Schema.Types.ObjectId, ref: 'EduGrade', default: null },
    fieldId: { type: Schema.Types.ObjectId, ref: 'EduField', default: null },
    bookId: { type: Schema.Types.ObjectId, ref: 'EduBook', default: null },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)
eduCustomSectionSchema.index({ levelId: 1, gradeId: 1, bookId: 1, order: 1 })

export interface IEduResource extends Document {
  category: EduResourceCategory
  customSectionId: Types.ObjectId | null
  contentType: EduResourceContentType
  levelId: Types.ObjectId
  gradeId: Types.ObjectId | null
  fieldId: Types.ObjectId | null
  bookId: Types.ObjectId | null
  chapterId: Types.ObjectId | null
  lessonId: Types.ObjectId | null
  title: string
  description: string
  fileUrl: string | null
  textContent: string
  fileSizeBytes: number
  durationSeconds: number
  order: number
  isActive: boolean
}

const eduResourceSchema = new Schema<IEduResource>(
  {
    category: {
      type: String,
      enum: ['main_pdf', 'step_by_step', 'note', 'video', 'custom'],
      required: true,
    },
    customSectionId: { type: Schema.Types.ObjectId, ref: 'EduCustomSection', default: null },
    contentType: {
      type: String,
      enum: ['pdf', 'video', 'text', 'image', 'link'],
      required: true,
    },
    levelId: { type: Schema.Types.ObjectId, ref: 'EduLevel', required: true },
    gradeId: { type: Schema.Types.ObjectId, ref: 'EduGrade', default: null },
    fieldId: { type: Schema.Types.ObjectId, ref: 'EduField', default: null },
    bookId: { type: Schema.Types.ObjectId, ref: 'EduBook', default: null },
    chapterId: { type: Schema.Types.ObjectId, ref: 'EduChapter', default: null },
    lessonId: { type: Schema.Types.ObjectId, ref: 'EduLesson', default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    fileUrl: { type: String, default: null },
    textContent: { type: String, default: '' },
    fileSizeBytes: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)
eduResourceSchema.index({ bookId: 1, category: 1, order: 1 })
eduResourceSchema.index({ levelId: 1, gradeId: 1, customSectionId: 1, order: 1 })

export const EduLevel = mongoose.model<IEduLevel>('EduLevel', eduLevelSchema)
export const EduGrade = mongoose.model<IEduGrade>('EduGrade', eduGradeSchema)
export const EduField = mongoose.model<IEduField>('EduField', eduFieldSchema)
export const EduBook = mongoose.model<IEduBook>('EduBook', eduBookSchema)
export const EduChapter = mongoose.model<IEduChapter>('EduChapter', eduChapterSchema)
export const EduLesson = mongoose.model<IEduLesson>('EduLesson', eduLessonSchema)
export const EduBackupSnapshot = mongoose.model<IEduBackupSnapshot>('EduBackupSnapshot', eduBackupSnapshotSchema)
export const EduAuditLog = mongoose.model<IEduAuditLog>('EduAuditLog', eduAuditLogSchema)
export const EduCustomSection = mongoose.model<IEduCustomSection>('EduCustomSection', eduCustomSectionSchema)
export const EduResource = mongoose.model<IEduResource>('EduResource', eduResourceSchema)
