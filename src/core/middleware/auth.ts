import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { User, IUser } from '../models/User.js'
import { StudentProfile } from '../models/StudentProfile.js'
import { TeacherProfile } from '../models/TeacherProfile.js'
import { logger } from '../utils/logger.js'

export interface AuthRequest extends Request {
  user?: IUser
}

interface JwtPayload {
  userId?: string     // ساختار توکن‌های قدیمی پنل ادمین
  id?: string         // ساختار توکن‌های جدید اپلیکیشن‌ها
  username?: string
  identifier?: string // شماره موبایل در توکن‌های جدید
  role?: string
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined

    // بررسی هدر Authorization
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1]
    }

    if (!token) {
      res.status(401).json({
        success: false,
        message: '⛔ دسترسی غیرمجاز. لطفاً وارد حساب کاربری خود شوید',
        error: 'TOKEN_MISSING',
      })
      return
    }

    // تایید توکن
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default-secret'
    ) as JwtPayload

    // پشتیبانی همزمان از توکن‌های ادمین (userId) و اپلیکیشن (id)
    const targetId = decoded.userId || decoded.id

    if (!targetId) {
      res.status(401).json({
        success: false,
        message: '⛔ ساختار توکن نامعتبر است',
        error: 'INVALID_TOKEN_PAYLOAD',
      })
      return
    }

    // پیدا کردن کاربر
    const user = await User.findById(targetId)

    if (!user) {
      res.status(401).json({
        success: false,
        message: '⛔ کاربر یافت نشد. لطفاً دوباره وارد شوید',
        error: 'USER_NOT_FOUND',
      })
      return
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        message: '⛔ حساب کاربری شما غیرفعال شده است',
        error: 'ACCOUNT_DISABLED',
      })
      return
    }

    // کاربر با موفقیت احراز هویت شد
    req.user = user

      // در کنترلرهای جدید، گاهی از identifier استفاده کرده بودیم، 
      // با این خط مطمئن می‌شویم که مقادیر مورد نیاز در req به درستی ست شده‌اند
      ; (req as any).user.identifier = user.username

    next()
  } catch (error: any) {
    logger.error('❌ خطا در احراز هویت:', error.message)

    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        message: '⛔ توکن نامعتبر است. لطفاً دوباره وارد شوید',
        error: 'INVALID_TOKEN',
      })
      return
    }

    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        message: '⛔ توکن منقضی شده است. لطفاً دوباره وارد شوید',
        error: 'TOKEN_EXPIRED',
      })
      return
    }

    res.status(500).json({
      success: false,
      message: '❌ خطای سرور در احراز هویت',
      error: 'AUTH_ERROR',
    })
  }
}

// میدلور برای محدود کردن دسترسی به ادمین (بدون تغییر ماند تا سیستم قبلی کار کند)
export const adminOnly = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user && req.user.role === 'admin') {
    next()
  } else {
    res.status(403).json({
      success: false,
      message: '⛔ فقط مدیر سیستم به این بخش دسترسی دارد',
      error: 'ADMIN_ONLY',
    })
  }
}

// میدلورهای جدید برای اپلیکیشن
export const teacherOnly = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user && req.user.role === 'teacher') {
    next()
  } else {
    res.status(403).json({
      success: false,
      message: '⛔ فقط معلم به این بخش دسترسی دارد',
      error: 'TEACHER_ONLY',
    })
  }
}

export const studentOnly = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.user && (req.user.role === 'student' || (req as any).tokenRole === 'student')) {
    next();
    return;
  }
  if (req.user) {
    const sp = await StudentProfile.findOne({ user: req.user._id });
    if (sp) {
      next();
      return;
    }
  }
  res.status(403).json({
    success: false,
    message: '⛔ فقط دانش‌آموز به این بخش دسترسی دارد',
    error: 'STUDENT_ONLY',
  });
};