import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IClassroom extends Document {
  teacher: Types.ObjectId
  school?: Types.ObjectId
  name: string
  course?: Types.ObjectId
  grade?: Types.ObjectId
  subjectName?: string // برای کلاس‌های دلخواه
  gradeName?: string   // برای پایه‌های دلخواه
  description?: string
  academicYear?: string
  students: string[] // کش از شماره‌های دانش‌آموزان
  isActive: boolean
}

const classroomSchema = new Schema<IClassroom>(
  {
    teacher: { type: Schema.Types.ObjectId, ref: 'TeacherProfile', required: true },
    school: { type: Schema.Types.ObjectId, ref: 'School' },
    name: { type: String, required: true, trim: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course' },
    grade: { type: Schema.Types.ObjectId, ref: 'Grade' },
    subjectName: { type: String, trim: true },
    gradeName: { type: String, trim: true },
    description: { type: String, trim: true },
    academicYear: { type: String, trim: true },
    students: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

export const Classroom = mongoose.model<IClassroom>('Classroom', classroomSchema)