import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { User } from '../../../core/models/User.js'
import { AuthRequest } from '../../../core/middleware/auth.js'
import { logger } from '../../../core/utils/logger.js'

// تولید توکن JWT (بدون محدودیت زمانی)
const generateToken = (userId: string, username: string, role: string): string => {
  return jwt.sign(
    { userId, username, role },
    process.env.JWT_SECRET || 'default-secret'
    // بدون expiresIn - توکن منقضی نمی‌شود
  )
}

// @desc    ورود به سیستم
// @route   POST /api/auth/login
// @access  Public
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body

    // اعتبارسنجی
    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: '⚠️ لطفاً نام کاربری و رمز عبور را وارد کنید',
        error: 'MISSING_CREDENTIALS',
      })
      return
    }

    // پیدا کردن کاربر با رمز عبور
    const user = await User.findOne({ username: username.toLowerCase() }).select('+password')

    if (!user) {
      res.status(401).json({
        success: false,
        message: '⛔ نام کاربری یا رمز عبور اشتباه است',
        error: 'INVALID_CREDENTIALS',
      })
      return
    }

    // بررسی فعال بودن حساب
    if (!user.isActive) {
      res.status(403).json({
        success: false,
        message: '⛔ حساب کاربری شما غیرفعال شده است. با مدیر سیستم تماس بگیرید',
        error: 'ACCOUNT_DISABLED',
      })
      return
    }

    // بررسی رمز عبور
    const isMatch = await user.comparePassword(password)

    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: '⛔ نام کاربری یا رمز عبور اشتباه است',
        error: 'INVALID_CREDENTIALS',
      })
      return
    }

    // آپدیت آخرین ورود
    user.lastLogin = new Date()
    await user.save()

    // تولید توکن
    const token = generateToken(user._id as any, user.username, user.role)

    logger.info(`✅ کاربر "${user.username}" وارد سیستم شد`)

    res.status(200).json({
      success: true,
      message: '✅ خوش آمدید',
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          lastLogin: user.lastLogin,
        },
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در ورود:', error.message)
    res.status(500).json({
      success: false,
      message: '❌ خطای سرور در ورود به سیستم',
      error: 'LOGIN_ERROR',
    })
  }
}

// @desc    دریافت اطلاعات کاربر فعلی
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        lastLogin: user.lastLogin,
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت اطلاعات کاربر:', error.message)
    res.status(500).json({
      success: false,
      message: '❌ خطای سرور در دریافت اطلاعات کاربر',
      error: 'GET_ME_ERROR',
    })
  }
}
