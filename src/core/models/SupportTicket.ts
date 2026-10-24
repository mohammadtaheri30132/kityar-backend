import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISupportMessage {
  _id?: Types.ObjectId;
  sender: 'teacher' | 'admin';
  senderName: string;
  senderId?: Types.ObjectId;
  text: string;
  createdAt: Date;
}

export interface ISupportTicket extends Document {
  teacherId: Types.ObjectId;
  teacherName: string;
  teacherPhone: string;
  subject: string;
  status: 'open' | 'answered' | 'closed';
  messages: ISupportMessage[];
  lastReplyAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const supportMessageSchema = new Schema<ISupportMessage>(
  {
    sender: {
      type: String,
      enum: ['teacher', 'admin'],
      required: true,
    },
    senderName: {
      type: String,
      default: '',
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    text: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    teacherName: {
      type: String,
      required: true,
      trim: true,
    },
    teacherPhone: {
      type: String,
      trim: true,
      default: '',
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['open', 'answered', 'closed'],
      default: 'open',
      index: true,
    },
    messages: [supportMessageSchema],
    lastReplyAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const SupportTicket = mongoose.model<ISupportTicket>('SupportTicket', supportTicketSchema);
