import mongoose, { Document, Schema } from 'mongoose'

export interface ITeacherClass extends Document {
  teacherId: mongoose.Types.ObjectId
  schoolId: mongoose.Types.ObjectId
  name: string
  grade?: string
  room?: string
  createdAt: Date
  updatedAt: Date
}

const teacherClassSchema = new Schema<ITeacherClass>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'نام کلاس الزامی است'],
      trim: true,
    },
    grade: {
      type: String,
      trim: true,
    },
    room: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
)

// Prevent duplicate class in same school for a teacher
teacherClassSchema.index({ teacherId: 1, schoolId: 1, name: 1 }, { unique: true })

export const TeacherClass = mongoose.model<ITeacherClass>('TeacherClass', teacherClassSchema)
