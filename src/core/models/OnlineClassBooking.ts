import mongoose, { Document, Schema, Types } from 'mongoose'

export type ClassBookingStatus =
  | 'created'
  | 'pending_payment'
  | 'paid_pending_teacher'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'in_progress'
  | 'completed'
  | 'refunded'

export interface IInvitedStudent {
  studentId?: Types.ObjectId
  phoneNumber: string
  fullName: string
  status: 'invited' | 'accepted' | 'declined'
  invitedAt: Date
  acceptedAt?: Date
}

export interface IBookingPricing {
  baseClassPrice: number
  extraCapacityCount: number
  extraCapacityFee: number
  subtotal: number
  studentServiceFee: number
  totalPrice: number
  perStudentShare: number
  teacherEarnings: number
  teacherServiceFee: number
}

export interface IBookingPayment {
  isPaid: boolean
  paidAt?: Date
  paymentMethod: 'mock_sandbox' | 'wallet' | 'gateway'
  transactionId?: Types.ObjectId
  trackingCode: string
}

export interface IBookingMeeting {
  platform: 'jitsi' | 'google_meet' | 'skyroom' | 'in_app'
  meetingLink: string
  roomName: string
  password?: string
}

export interface IBookingReview {
  rating: number
  comment?: string
  voiceUrl?: string
  isComplaint?: boolean
  complaintText?: string
  reviewedAt?: Date
}

export interface IOnlineClassBooking extends Document {
  bookingCode: string
  studentId: Types.ObjectId
  teacherId?: Types.ObjectId
  targetTeacherIds?: Types.ObjectId[]
  courseId?: Types.ObjectId
  courseName: string
  gradeId?: Types.ObjectId
  gradeName: string
  subjectId?: Types.ObjectId
  subjectName: string
  educationLevel?: 'elementary' | 'secondary'
  topic: string
  description?: string
  scheduledAt: Date
  durationMinutes: number
  endTime: Date
  capacity: number
  invitedStudents: IInvitedStudent[]
  pricing: IBookingPricing
  status: ClassBookingStatus
  cannotCancelBefore?: Date
  waitingExpiresAt?: Date
  rejectionReason?: string
  cancellationReason?: string
  payment: IBookingPayment
  meeting: IBookingMeeting
  review?: IBookingReview
  createdAt: Date
  updatedAt: Date
}

const invitedStudentSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User' },
    phoneNumber: { type: String, required: true },
    fullName: { type: String, required: true },
    status: {
      type: String,
      enum: ['invited', 'accepted', 'declined'],
      default: 'invited',
    },
    invitedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date },
  },
  { _id: false }
)

const pricingSchema = new Schema(
  {
    baseClassPrice: { type: Number, required: true, default: 0 },
    extraCapacityCount: { type: Number, required: true, default: 0 },
    extraCapacityFee: { type: Number, required: true, default: 0 },
    subtotal: { type: Number, required: true, default: 0 },
    studentServiceFee: { type: Number, required: true, default: 0 },
    totalPrice: { type: Number, required: true, default: 0 },
    perStudentShare: { type: Number, required: true, default: 0 },
    teacherEarnings: { type: Number, required: true, default: 0 },
    teacherServiceFee: { type: Number, required: true, default: 0 },
  },
  { _id: false }
)

const paymentSchema = new Schema(
  {
    isPaid: { type: Boolean, default: false },
    paidAt: { type: Date },
    paymentMethod: {
      type: String,
      enum: ['mock_sandbox', 'wallet', 'gateway'],
      default: 'mock_sandbox',
    },
    transactionId: { type: Schema.Types.ObjectId, ref: 'WalletTransaction' },
    trackingCode: { type: String, default: '' },
  },
  { _id: false }
)

const meetingSchema = new Schema(
  {
    platform: {
      type: String,
      enum: ['jitsi', 'google_meet', 'skyroom', 'in_app'],
      default: 'jitsi',
    },
    meetingLink: { type: String, default: '' },
    roomName: { type: String, default: '' },
    password: { type: String, default: '' },
  },
  { _id: false }
)

const onlineClassBookingSchema = new Schema<IOnlineClassBooking>(
  {
    bookingCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    targetTeacherIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    courseName: { type: String, default: '' },
    gradeId: { type: Schema.Types.ObjectId, ref: 'Grade' },
    gradeName: { type: String, default: '' },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    subjectName: { type: String, required: true },
    educationLevel: { type: String, enum: ['elementary', 'secondary'] },
    topic: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, default: 90 },
    endTime: { type: Date, required: true },
    capacity: { type: Number, default: 1, min: 1, max: 20 },
    invitedStudents: { type: [invitedStudentSchema], default: [] },
    pricing: { type: pricingSchema, required: true },
    cannotCancelBefore: { type: Date },
    waitingExpiresAt: { type: Date },
    status: {
      type: String,
      enum: [
        'created',
        'pending_payment',
        'paid_pending_teacher',
        'confirmed',
        'rejected',
        'cancelled',
        'expired',
        'in_progress',
        'completed',
        'refunded',
      ],
      default: 'pending_payment',
      index: true,
    },
    rejectionReason: { type: String, default: '' },
    cancellationReason: { type: String, default: '' },
    payment: { type: paymentSchema, default: () => ({ isPaid: false, trackingCode: '' }) },
    meeting: { type: meetingSchema, default: () => ({ platform: 'in_app', meetingLink: '', roomName: '' }) },
    review: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, default: '' },
      voiceUrl: { type: String },
      isComplaint: { type: Boolean, default: false },
      complaintText: { type: String },
      reviewedAt: { type: Date },
    },
  },
  { timestamps: true }
)

onlineClassBookingSchema.index({ teacherId: 1, scheduledAt: 1, endTime: 1 })
onlineClassBookingSchema.index({ studentId: 1, scheduledAt: -1 })
onlineClassBookingSchema.index({ status: 1, scheduledAt: 1 })

export const OnlineClassBooking = mongoose.model<IOnlineClassBooking>(
  'OnlineClassBooking',
  onlineClassBookingSchema
)

