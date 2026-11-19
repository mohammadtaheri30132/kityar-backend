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
  userId?: Types.ObjectId
  createdAt: Date
  usedAt?: Date
  isUsed?: boolean
}

export type ClassroomUiMode = 'online_class' | 'seminar'

export type RegistrationFieldType = 'text' | 'phone' | 'email' | 'number' | 'select' | 'checkbox'

export interface IRegistrationFormField {
  id: string
  label: string
  type: RegistrationFieldType
  required?: boolean
  placeholder?: string
  options?: string[]
}

export interface IRegistrationFormConfig {
  enabled: boolean
  title?: string
  description?: string
  fields: IRegistrationFormField[]
}

export interface IAttendeePresenceSession {
  peerId?: string
  joinedAt: Date
  leftAt?: Date
  durationSeconds: number
}

export interface ISeminarAttendeeRecord {
  attendeeKey: string
  displayName: string
  role: 'teacher' | 'student' | 'admin'
  formAnswers?: Record<string, any>
  registeredAt?: Date
  firstJoinedAt?: Date
  lastJoinedAt?: Date
  lastLeftAt?: Date
  joinCount: number
  totalDurationSeconds: number
  isOnline: boolean
  activePeerIds: string[]
  sessions: IAttendeePresenceSession[]
}

export interface ITelemetrySampleSnapshot {
  timestamp: Date | number
  cpuPercent: number
  loadAvg1m: number
  rssMb: number
  heapUsedMb: number
  heapTotalMb: number
  systemFreeRamMb: number
  eventLoopLagP95Ms: number
  activeParticipants: number
  activeRooms: number
  wsMsgsPerSec: number
  estimatedPeerLinks: number
}

export interface ISessionTelemetrySummary {
  startedAt?: Date
  endedAt?: Date
  peakConcurrentParticipants: number
  peakCpuPercent: number
  peakRssMb: number
  peakEventLoopLagP95Ms: number
  wsMessagesReceived: number
  wsMessagesBroadcast: number
  samples: ITelemetrySampleSnapshot[]
}

export interface ISeminarPollOption {
  id: string
  text: string
}

export interface ISeminarPoll {
  id: string
  question: string
  allowMultiple?: boolean
  isClosed: boolean
  createdByPeerId?: string
  createdByName: string
  createdAt: number
  closedAt?: number
  options: ISeminarPollOption[]
  votesByVoter: Record<string, string[]>
}

export interface IRecordingServerLog {
  id?: string
  timestamp: Date | number
  offsetMs: number
  type:
    | 'recording_started'
    | 'recording_stopped'
    | 'participant_joined'
    | 'participant_left'
    | 'participant_removed'
    | 'mic_changed'
    | 'camera_changed'
    | 'screen_share_changed'
    | 'whiteboard_action'
    | 'chat_message'
    | 'permission_changed'
    | 'room_ended'
    | 'system'
  actorId?: string
  actorName?: string
  actorRole?: 'teacher' | 'student' | 'admin' | 'system'
  peerId?: string
  message: string
  metadata?: Record<string, any>
  payload?: any
}

export interface IClassroomRecording {
  status: 'idle' | 'recording' | 'completed' | 'deleted'
  mode: 'auto' | 'manual_test'
  startedAt?: Date
  endedAt?: Date
  durationSeconds: number
  videoUrl?: string
  fileSize?: number
  mimeType?: string
  expiresAt?: Date
  deletedAt?: Date
  chunksCount?: number
  serverLogs: IRecordingServerLog[]
  chatLog: Array<{
    id: string
    senderPeerId?: string
    senderId?: string
    senderName: string
    senderRole: 'teacher' | 'student' | 'admin'
    text?: string
    message?: string
    fileUrl?: string
    fileName?: string
    timestamp: Date | number
    offsetMs: number
  }>
  whiteboardTimeline: Array<{
    timestamp: Date | number
    offsetMs: number
    page?: number
    action: string
    payload?: any
  }>
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
  uiMode: ClassroomUiMode
  registrationForm?: IRegistrationFormConfig
  attendees: ISeminarAttendeeRecord[]
  polls?: ISeminarPoll[]
  telemetrySummary?: ISessionTelemetrySummary
  whiteboardData?: IWhiteboardSnapshot
  recording?: IClassroomRecording
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

const participantLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
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
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
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
    uiMode: {
      type: String,
      enum: ['online_class', 'seminar'],
      default: 'online_class',
      index: true,
    },
    registrationForm: {
      enabled: { type: Boolean, default: false },
      title: { type: String, trim: true },
      description: { type: String, trim: true },
      fields: { type: [Schema.Types.Mixed], default: [] },
    },
    attendees: { type: [Schema.Types.Mixed] as any, default: [] },
    polls: { type: [Schema.Types.Mixed] as any, default: [] },
    telemetrySummary: {
      startedAt: { type: Date },
      endedAt: { type: Date },
      peakConcurrentParticipants: { type: Number, default: 0 },
      peakCpuPercent: { type: Number, default: 0 },
      peakRssMb: { type: Number, default: 0 },
      peakEventLoopLagP95Ms: { type: Number, default: 0 },
      wsMessagesReceived: { type: Number, default: 0 },
      wsMessagesBroadcast: { type: Number, default: 0 },
      samples: { type: [Schema.Types.Mixed], default: [] },
    },
    whiteboardData: { type: whiteboardSnapshotSchema },
    recording: {
      status: {
        type: String,
        enum: ['idle', 'recording', 'completed', 'deleted'],
        default: 'idle',
        index: true,
      },
      mode: {
        type: String,
        enum: ['auto', 'manual_test'],
        default: 'auto',
      },
      startedAt: { type: Date },
      endedAt: { type: Date },
      durationSeconds: { type: Number, default: 0 },
      videoUrl: { type: String },
      fileSize: { type: Number, default: 0 },
      mimeType: { type: String, default: 'video/webm' },
      expiresAt: { type: Date, index: true },
      deletedAt: { type: Date },
      chunksCount: { type: Number, default: 0 },
      serverLogs: { type: [Schema.Types.Mixed], default: [] },
      chatLog: { type: [Schema.Types.Mixed], default: [] },
      whiteboardTimeline: { type: [Schema.Types.Mixed], default: [] },
    },
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

