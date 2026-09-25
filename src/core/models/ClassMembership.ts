import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IClassMembership extends Document {
  classId: Types.ObjectId
  studentId?: Types.ObjectId
  studentPhone: string
  firstName?: string
  lastName?: string
  fatherName?: string
  status: 'ACTIVE' | 'PENDING' | 'UNMATCHED' | 'ARCHIVED'
  source: 'MANUAL' | 'EXAM_LINK' | 'INVITATION'
  joinedAt: Date
}

const classMembershipSchema = new Schema<IClassMembership>(
  {
    classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'StudentProfile' },
    studentPhone: { type: String, required: true },
    firstName: { type: String },
    lastName: { type: String },
    fatherName: { type: String },
    status: { type: String, enum: ['ACTIVE', 'PENDING', 'UNMATCHED', 'ARCHIVED'], default: 'ACTIVE' },
    source: { type: String, enum: ['MANUAL', 'EXAM_LINK', 'INVITATION'], default: 'MANUAL' },
    joinedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
)

// Ensure unique membership for a specific phone in a specific class
classMembershipSchema.index({ classId: 1, studentPhone: 1 }, { unique: true })

export const ClassMembership = mongoose.model<IClassMembership>('ClassMembership', classMembershipSchema)
