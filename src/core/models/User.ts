import mongoose, { Document, Schema } from 'mongoose'
import bcrypt from 'bcryptjs'

export interface IUser extends Document {
  username: string
  password: string
  fullName: string
  role: 'admin' | 'teacher'
  isActive: boolean
  lastLogin: Date | null
  comparePassword(candidatePassword: string): Promise<boolean>
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: [true, 'نام کاربری الزامی است'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'رمز عبور الزامی است'],
      minlength: [6, 'رمز عبور باید حداقل ۶ کاراکتر باشد'],
      select: false, // در کوئری‌ها برگردانده نشود
    },
    fullName: {
      type: String,
      required: [true, 'نام کامل الزامی است'],
      trim: true,
    },
    role: {
      type: String,
      enum: ['admin', 'teacher','student'],
      default: 'teacher',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

// هش کردن رمز عبور قبل از ذخیره
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()

  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error: any) {
    next(error)
  }
})

// متد مقایسه رمز عبور
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password)
}

export const User = mongoose.model<IUser>('User', userSchema)
