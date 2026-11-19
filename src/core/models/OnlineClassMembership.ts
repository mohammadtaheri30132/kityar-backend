import mongoose, { Document, Schema, Types } from 'mongoose'

export type OnlineClassMembershipRole = 'requester' | 'invited'
export type OnlineClassMembershipSource = 'booking' | 'teacher_invitation'
export type OnlineClassMembershipStatus =
  | 'active'
  | 'pending_invite'
  | 'accepted'
  | 'declined'
  | 'removed'

export interface IOnlineClassMembership extends Document {
  bookingId: Types.ObjectId
  studentId?: Types.ObjectId
  phoneNumber?: string
  fullName: string
  role: OnlineClassMembershipRole
  source: OnlineClassMembershipSource
  status: OnlineClassMembershipStatus
  joinedAt: Date
  respondedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const onlineClassMembershipSchema = new Schema<IOnlineClassMembership>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'OnlineClassBooking',
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      default: 'دانش‌آموز',
      trim: true,
    },
    role: {
      type: String,
      enum: ['requester', 'invited'],
      default: 'invited',
      required: true,
    },
    source: {
      type: String,
      enum: ['booking', 'teacher_invitation'],
      default: 'booking',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'pending_invite', 'accepted', 'declined', 'removed'],
      default: 'pending_invite',
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    respondedAt: {
      type: Date,
    },
  },
  { timestamps: true }
)

// Prevent duplicate membership records for the same student in the same online class
onlineClassMembershipSchema.index(
  { bookingId: 1, studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { studentId: { $exists: true, $type: 'objectId' } },
  }
)

onlineClassMembershipSchema.index(
  { bookingId: 1, phoneNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { phoneNumber: { $exists: true, $type: 'string' } },
  }
)

export const OnlineClassMembership = mongoose.model<IOnlineClassMembership>(
  'OnlineClassMembership',
  onlineClassMembershipSchema
)
