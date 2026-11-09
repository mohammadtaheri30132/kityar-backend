import mongoose, { Document, Schema, Types } from 'mongoose'

export type OnlineClassPlatform = 'google_meet' | 'jitsi' | 'skyroom' | 'other'
export type OnlineClassStatus = 'scheduled' | 'live' | 'completed' | 'cancelled'

export interface IOnlineClass extends Document {
  teacherId: Types.ObjectId
  title: string
  description: string
  gradeId?: Types.ObjectId
  subjectId?: Types.ObjectId
  scheduledAt: Date
  durationMinutes: number
  platform: OnlineClassPlatform
  meetingLink: string
  accessCode?: string
  isFree: boolean
  price: number // in Tomans
  capacity: number
  registeredStudents: Types.ObjectId[]
  status: OnlineClassStatus
  createdAt: Date
  updatedAt: Date
}

const onlineClassSchema = new Schema<IOnlineClass>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    gradeId: { type: Schema.Types.ObjectId, ref: 'Grade' },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 60 },
    platform: {
      type: String,
      enum: ['google_meet', 'jitsi', 'skyroom', 'other'],
      default: 'jitsi',
    },
    meetingLink: { type: String, required: true, trim: true },
    accessCode: { type: String, trim: true },
    isFree: { type: Boolean, default: true },
    price: { type: Number, default: 0, min: 0 },
    capacity: { type: Number, default: 50 },
    registeredStudents: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['scheduled', 'live', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
  },
  { timestamps: true }
)

onlineClassSchema.index({ teacherId: 1, scheduledAt: -1 })
onlineClassSchema.index({ status: 1, scheduledAt: 1 })

export const OnlineClass = mongoose.model<IOnlineClass>('OnlineClass', onlineClassSchema)
