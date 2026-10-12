import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICommunityRestriction extends Document {
  user: Types.ObjectId;
  userName: string;
  userPhone?: string;
  restrictedBy: Types.ObjectId;
  reason: string;
  expiresAt?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const communityRestrictionSchema = new Schema<ICommunityRestriction>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    userPhone: {
      type: String,
      default: '',
    },
    restrictedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const CommunityRestriction = mongoose.model<ICommunityRestriction>(
  'CommunityRestriction',
  communityRestrictionSchema
);
