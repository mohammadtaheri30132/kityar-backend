import mongoose, { Document, Schema } from 'mongoose'

export interface ITask extends Document {
  teacherId: mongoose.Types.ObjectId
  title: string
  description?: string
  dueDate?: string // e.g., '1405-07-25'
  time?: string // e.g., '10:30'
  category?: string
  priority: 'normal' | 'important' | 'urgent'
  status: 'pending' | 'completed'
  forWhere?: string
  forWhom?: string
  createdAt: Date
  updatedAt: Date
}

const taskSchema = new Schema<ITask>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'عنوان کار الزامی است'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    dueDate: {
      type: String,
      index: true,
    },
    time: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    priority: {
      type: String,
      enum: ['normal', 'important', 'urgent'],
      default: 'normal',
    },
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending',
    },
    forWhere: {
      type: String,
      trim: true,
    },
    forWhom: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
)

export const Task = mongoose.model<ITask>('Task', taskSchema)
