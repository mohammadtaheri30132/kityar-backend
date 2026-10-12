import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICommunityAuditLog extends Document {
  actor: Types.ObjectId;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, any>;
  createdAt: Date;
}

const communityAuditLogSchema = new Schema<ICommunityAuditLog>(
  {
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorName: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      required: true,
    },
    targetId: {
      type: String,
      default: '',
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

communityAuditLogSchema.index({ createdAt: -1 });

export const CommunityAuditLog = mongoose.model<ICommunityAuditLog>(
  'CommunityAuditLog',
  communityAuditLogSchema
);
