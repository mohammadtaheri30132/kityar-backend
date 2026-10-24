import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IClassroom extends Document {
  teacher: Types.ObjectId
  school?: Types.ObjectId
  name: string
  code: string // شناسه چند رقمی عددی یکتا (مثلا ۶ رقم)
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
    code: { type: String, unique: true, sparse: true, index: true, trim: true },
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

/**
 * تولید یک کد عددی چند رقمی یکتا برای کلاس
 */
export async function generateUniqueClassCode(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    // تولید عدد ۶ رقمی بین ۱۰۰۰۰۰ تا ۹۹۹۹۹۹
    const candidate = Math.floor(100000 + Math.random() * 900000).toString()
    const exists = await Classroom.findOne({ code: candidate })
    if (!exists) {
      return candidate
    }
  }
  return `${Date.now()}`.slice(-6)
}