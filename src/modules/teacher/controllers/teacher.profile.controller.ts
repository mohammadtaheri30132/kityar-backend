import { Request, Response } from 'express'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { User } from '../../../core/models/User.js'
import { logger } from '../../../core/utils/logger.js'

/**
 * دریافت اطلاعات کامل پروفایل معلم
 */
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    // آیدی کاربر از میدلور protect استخراج می‌شود
    const userId = (req as any).user?.id || (req as any).user?._id

    if (!userId) {
      res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' })
      return
    }

    // پیدا کردن پروفایل و جوین کردن (populate) با مدل User برای دریافت نام و شماره تماس
    const profile = await TeacherProfile.findOne({ user: userId })
      .populate('user', 'fullName username role lastLogin')

    if (!profile) {
      res.status(404).json({ success: false, message: 'پروفایل معلم یافت نشد' })
      return
    }

    res.status(200).json({
      success: true,
      data: profile,
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت پروفایل معلم:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت اطلاعات' })
  }
}

/**
 * تکمیل و ویرایش پروفایل معلم
 */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id

    if (!userId) {
      res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' })
      return
    }

    const { fullName, category, position, schools } = req.body

    // ۱. بروزرسانی اطلاعات پایه در مدل User (مثل نام و نام خانوادگی)
    // اگر کاربر نام خود را تغییر داده باشد، آن را آپدیت می‌کنیم
    if (fullName) {
      await User.findByIdAndUpdate(
        userId,
        { fullName },
        { runValidators: true }
      )
    }

    // ۲. پیدا کردن و بروزرسانی پروفایل تخصصی معلم
    // از عملگر $set استفاده می‌کنیم تا فقط فیلدهایی که ارسال شده‌اند آپدیت شوند
    const updatedProfile = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          ...(category && { category }),
          ...(position && { position }),
          ...(schools && { schools }),
        }
      },
      { new: true, runValidators: true }
    ).populate('user', 'fullName username role') // پس از آپدیت، اطلاعات جدید کاربر هم ضمیمه شود

    if (!updatedProfile) {
      res.status(404).json({ success: false, message: 'پروفایل معلم یافت نشد' })
      return
    }

    res.status(200).json({
      success: true,
      message: 'پروفایل با موفقیت بروزرسانی شد',
      data: updatedProfile,
    })
  } catch (error: any) {
    logger.error('❌ خطا در بروزرسانی پروفایل معلم:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ذخیره تغییرات' })
  }
}