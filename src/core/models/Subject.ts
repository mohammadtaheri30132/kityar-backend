import mongoose, { Document, Schema } from 'mongoose'

export interface ISubject extends Document {
  name: string
  color: string
  category?: string
  icon?: string
}

const subjectSchema = new Schema<ISubject>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    color: {
      type: String,
      default: '#3b82f6',
    },
    category: {
      type: String,
    },
    icon: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
)

export const Subject = mongoose.model<ISubject>('Subject', subjectSchema)
