import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { User } from '../../../core/models/User.js'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { logger } from '../../../core/utils/logger.js'

// تابع ثابت برای تولید OTP (طبق درخواست شما)
const generateMockOtp = (): string => '12345'

// تولید توکن JWT برای ورود
const generateToken = (userId: string, identifier: string): string => {
  const secret = process.env.JWT_SECRET || 'your_super_secret_key'
  return jwt.sign({ id: userId, identifier }, secret, { expiresIn: '30d' })
}

/**
 * گام اول: بررسی شماره تماس در صفحه اول اپلیکیشن
 */
export const checkPhone = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber } = req.body

    if (!phoneNumber) {
      res.status(400).json({ success: false, message: 'شماره موبایل الزامی است' })
      return
    }

    // بررسی وجود کاربر با این شماره (username)[cite: 6]
    const user = await User.findOne({ username: phoneNumber })

    if (user) {
      // کاربر قبلا ثبت نام کرده است -> هدایت به صفحه رمز عبور
      res.status(200).json({
        success: true,
        data: {
          isRegistered: true,
          message: 'کاربر یافت شد. لطفاً رمز عبور را وارد کنید.',
        },
      })
    } else {
      // کاربر جدید است -> تولید OTP و هدایت به صفحه ثبت نام
      const otp = generateMockOtp()
      // در محیط واقعی، اینجا باید تابع ارسال پیامک فراخوانی شود
      
      res.status(200).json({
        success: true,
        data: {
          isRegistered: false,
          message: 'کد تایید ارسال شد. لطفاً فرم ثبت‌نام را تکمیل کنید.',
          // در پروداکشن، OTP نباید به فرانت‌اند ارسال شود و فقط باید پیامک شود
          // اما برای تست می‌توانید آن را برگردانید یا لاگ کنید
        },
      })
    }
  } catch (error: any) {
    logger.error('❌ خطا در بررسی شماره تماس:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * گام دوم: ثبت نام معلم جدید به همراه تایید OTP
 */
export const registerTeacher = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, fullName, password, otp } = req.body

    if (!phoneNumber || !fullName || !password || !otp) {
      res.status(400).json({ success: false, message: 'تکمیل تمامی فیلدها الزامی است' })
      return
    }

    // صحت‌سنجی OTP ثابت
    if (otp !== generateMockOtp()) {
      res.status(400).json({ success: false, message: 'کد تایید وارد شده اشتباه است' })
      return
    }

    // بررسی مجدد برای جلوگیری از ثبت‌نام تکراری
    const existingUser = await User.findOne({ username: phoneNumber })
    if (existingUser) {
      res.status(400).json({ success: false, message: 'این شماره قبلاً ثبت شده است' })
      return
    }

    // ایجاد کاربر جدید با نقش معلم[cite: 6]
    const newUser = new User({
      username: phoneNumber,
      fullName: fullName,
      password: password,
      role: 'teacher',
    })

    await newUser.save()

    // ساخت پروفایل اولیه معلم (مقادیر پیش‌فرض قرار می‌دهیم تا بعداً در تنظیمات اپلیکیشن تکمیل کند)
    const newProfile = new TeacherProfile({
      user: newUser._id,
      category: 'آموزگار', // مقدار پیش‌فرض
      position: 'معلم',
    })
    
    await newProfile.save()

    // صدور توکن ورود
    const token = generateToken(newUser._id.toString(), newUser.username)

    res.status(201).json({
      success: true,
      message: 'ثبت‌نام با موفقیت انجام شد',
      data: { token, fullName: newUser.fullName },
    })
  } catch (error: any) {
    logger.error('❌ خطا در ثبت‌نام معلم:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * ورود با رمز عبور
 */
export const loginWithPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, password } = req.body

    const user = await User.findOne({ username: phoneNumber }).select('+password') // اضافه کردن پسورد به کوئری[cite: 6]
    
    if (!user || !(await user.comparePassword(password))) { // استفاده از متد مقایسه پسورد[cite: 6]
      res.status(401).json({ success: false, message: 'شماره موبایل یا رمز عبور اشتباه است' })
      return
    }

    // بروزرسانی آخرین زمان ورود[cite: 6]
    user.lastLogin = new Date()
    await user.save()

    const token = generateToken(user._id.toString(), user.username)

    res.status(200).json({
      success: true,
      message: 'ورود موفقیت‌آمیز بود',
      data: { token, fullName: user.fullName },
    })
  } catch (error: any) {
    logger.error('❌ خطا در ورود با رمز عبور:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * درخواست OTP برای ورود یکبار مصرف (فراموشی رمز یا ورود سریع)
 */
export const requestLoginOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber } = req.body
    const user = await User.findOne({ username: phoneNumber })

    if (!user) {
      res.status(404).json({ success: false, message: 'حساب کاربری با این شماره یافت نشد' })
      return
    }

    const otp = generateMockOtp()
    // ارسال پیامک در اینجا انجام می‌شود
    
    res.status(200).json({ success: true, message: 'کد تایید ورود ارسال شد' })
  } catch (error: any) {
    logger.error('❌ خطا در درخواست رمز یکبار مصرف:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * ورود با OTP
 */
export const loginWithOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, otp } = req.body

    if (otp !== generateMockOtp()) {
      res.status(400).json({ success: false, message: 'کد تایید اشتباه است' })
      return
    }

    const user = await User.findOne({ username: phoneNumber })
    if (!user) {
      res.status(404).json({ success: false, message: 'کاربر یافت نشد' })
      return
    }

    user.lastLogin = new Date()
    await user.save()

    const token = generateToken(user._id.toString(), user.username)

    res.status(200).json({
      success: true,
      message: 'ورود موفقیت‌آمیز بود',
      data: { token, fullName: user.fullName },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}