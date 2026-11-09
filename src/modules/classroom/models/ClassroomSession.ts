import mongoose, { Document, Schema, Types } from 'mongoose'

export type ClassroomSessionStatus =
  | 'scheduled'
  | 'waiting'
  | 'active'
  | 'paused'
  | 'completed'
  | 'expired'
  | 'cancelled'

export interface IParticipantLog {
  userId?: Types.ObjectId
  identity: string
  name: string
  role: 'teacher' | 'student' | 'admin'
  joinedAt: Date
  leftAt?: Date
  clientPlatform?: string
}

export interface IWhiteboardSnapshot {
  elements: any[]
  viewport?: {
    scale: number
    scrollX: number
    scrollY: number
  }
  updatedAt: Date
  updatedBy?: Types.ObjectId
}

export interface IClassroomTicket {
  ticketCode: string
  role: 'teacher' | 'student'
  name: string
  createdAt: Date
  usedAt?: Date
  isUsed?: boolean
}

export interface IClassroomSession extends Document {
  bookingId?: Types.ObjectId
  bookingCode?: string
  sourceType: 'online_class_booking' | 'question_request' | 'ad_hoc'
  roomName: string
  provider?: 'internal' | 'plugnmeet'
  plugNmeetRoomId?: string
  livekitRoomSid?: string
  teacherId?: Types.ObjectId
  studentId?: Types.ObjectId
  teacherName?: string
  studentName?: string
  invitedStudentIds: Types.ObjectId[]
  inviteTickets: IClassroomTicket[]
  title: string
  topic?: string
  status: ClassroomSessionStatus
  startedAt?: Date
  endedAt?: Date
  durationSeconds: number
  maxParticipants: number
  participantsLog: IParticipantLog[]
  whiteboardData?: IWhiteboardSnapshot
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

const participantLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    identity: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['teacher', 'student', 'admin'], required: true },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date },
    clientPlatform: { type: String, default: 'unknown' },
  },
  { _id: false }
)

const whiteboardSnapshotSchema = new Schema(
  {
    elements: { type: [Schema.Types.Mixed], default: [] },
    viewport: {
      scale: { type: Number, default: 1 },
      scrollX: { type: Number, default: 0 },
      scrollY: { type: Number, default: 0 },
    },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
)

const classroomTicketSchema = new Schema(
  {
    ticketCode: { type: String, required: true },
    role: { type: String, enum: ['teacher', 'student'], required: true },
    name: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    usedAt: { type: Date },
    isUsed: { type: Boolean, default: false },
  },
  { _id: false }
)

const classroomSessionSchema = new Schema<IClassroomSession>(
  {
    bookingId: { type: Schema.Types.ObjectId, index: true },
    bookingCode: { type: String, index: true },
    sourceType: {
      type: String,
      enum: ['online_class_booking', 'question_request', 'ad_hoc'],
      default: 'online_class_booking',
      required: true,
    },
    roomName: { type: String, required: true, unique: true, index: true },
    provider: { type: String, enum: ['internal', 'plugnmeet'], default: 'internal', index: true },
    plugNmeetRoomId: { type: String, index: true },
    livekitRoomSid: { type: String },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    teacherName: { type: String },
    studentName: { type: String },
    invitedStudentIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    inviteTickets: { type: [classroomTicketSchema], default: [] },
    title: { type: String, required: true, trim: true },
    topic: { type: String, trim: true },
    status: {
      type: String,
      enum: ['scheduled', 'waiting', 'active', 'paused', 'completed', 'expired', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    startedAt: { type: Date },
    endedAt: { type: Date },
    durationSeconds: { type: Number, default: 0 },
    maxParticipants: { type: Number, default: 12 },
    participantsLog: { type: [participantLogSchema], default: [] },
    whiteboardData: { type: whiteboardSnapshotSchema },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  }
)

export const ClassroomSession = mongoose.model<IClassroomSession>(
  'ClassroomSession',
  classroomSessionSchema
)

