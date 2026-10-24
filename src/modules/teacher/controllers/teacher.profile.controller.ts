import { Request, Response } from 'express'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { User } from '../../../core/models/User.js'
import { Classroom } from '../../../core/models/Classroom.js'
import { CommunityPost } from '../../../core/models/CommunityPost.js'
import { logger } from '../../../core/utils/logger.js'
import { Types } from 'mongoose'

/**
 * دریافت اطلاعات کامل پروفایل و رزومه معلم به همراه آمار زنده
 */
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id

    if (!userId) {
      res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' })
      return
    }

    // ۱. پیدا کردن یا ایجاد خودکار پروفایل در صورت عدم وجود
    let profile = await TeacherProfile.findOne({ user: userId })
      .populate('user', 'fullName username role lastLogin')

    if (!profile) {
      profile = await TeacherProfile.create({
        user: userId,
        category: 'آموزگار',
        position: 'معلم',
        schools: [],
        headline: 'آموزگار کیتایار',
        bio: '',
        resume: {
          experiences: [],
          education: [],
          skills: [],
          certificates: [],
          honors: [],
        },
      })
      profile = await TeacherProfile.findById(profile._id)
        .populate('user', 'fullName username role lastLogin')
    }

    // ۲. محاسبه آمار واقعی معلم از پایگاه داده
    const classrooms = await Classroom.find({ teacher: profile!._id, isActive: true }).select('students')
    const classesCount = classrooms.length

    // شمارش کل دانش‌آموزان یکتا در تمامی کلاس‌های این معلم
    const allStudentsSet = new Set<string>()
    classrooms.forEach((c) => {
      if (Array.isArray(c.students)) {
        c.students.forEach((s) => allStudentsSet.add(s))
      }
    })
    const studentsCount = allStudentsSet.size

    // شمارش پست‌های منتشر شده در بخش تعامل
    const postsCount = await CommunityPost.countDocuments({ author: userId, isDeleted: false })

    // محاسبه سابقه کار بر اساس تاریخ‌های سوابق تدریس یا فیلد ثبت شده
    let calculatedExpYears = profile!.experienceYears || 0
    if (calculatedExpYears === 0 && profile!.resume?.experiences?.length > 0) {
      calculatedExpYears = profile!.resume.experiences.length // حداقل تعداد دوره‌ها
    }

    res.status(200).json({
      success: true,
      data: profile,
      stats: {
        classesCount,
        studentsCount,
        postsCount,
        experienceYears: calculatedExpYears,
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت پروفایل معلم:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت اطلاعات' })
  }
}

/**
 * ویرایش اطلاعات پایه پروفایل و رزومه معلم
 */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id

    if (!userId) {
      res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' })
      return
    }

    const {
      fullName,
      category,
      position,
      schools,
      headline,
      bio,
      avatar,
      city,
      province,
      experienceYears,
      resume,
    } = req.body

    // ۱. بروزرسانی نام کاربر در مدل User
    if (fullName) {
      await User.findByIdAndUpdate(userId, { fullName }, { runValidators: true })
    }

    // ۲. بروزرسانی پروفایل معلم
    const updateFields: any = {}
    if (category !== undefined) updateFields.category = category
    if (position !== undefined) updateFields.position = position
    if (schools !== undefined) updateFields.schools = schools
    if (headline !== undefined) updateFields.headline = headline
    if (bio !== undefined) updateFields.bio = bio
    if (avatar !== undefined) updateFields.avatar = avatar
    if (city !== undefined) updateFields.city = city
    if (province !== undefined) updateFields.province = province
    if (experienceYears !== undefined) updateFields.experienceYears = experienceYears
    if (resume !== undefined) updateFields.resume = resume

    const updatedProfile = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      { $set: updateFields },
      { new: true, upsert: true, runValidators: true }
    ).populate('user', 'fullName username role')

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

/**
 * بروزرسانی یکپارچه آبجکت رزومه
 */
export const updateResume = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id
    const { resume } = req.body

    if (!resume) {
      res.status(400).json({ success: false, message: 'داده‌های رزومه ارسال نشده است' })
      return
    }

    const updated = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      { $set: { resume } },
      { new: true }
    ).populate('user', 'fullName username role')

    res.status(200).json({
      success: true,
      message: 'رزومه با موفقیت به‌روزرسانی شد',
      data: updated?.resume,
    })
  } catch (error: any) {
    logger.error('❌ خطا در به‌روزرسانی رزومه:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ذخیره رزومه' })
  }
}

/**
 * افزودن سابقه شغلی جدید
 */
export const addExperience = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id
    const { title, school, location, startDate, endDate, isCurrent, description } = req.body

    if (!title || !school || !startDate) {
      res.status(400).json({ success: false, message: 'عنوان، نام مدرسه و سال شروع الزامی هستند' })
      return
    }

    const newExp = {
      id: new Types.ObjectId().toString(),
      title,
      school,
      location: location || '',
      startDate,
      endDate: endDate || '',
      isCurrent: !!isCurrent,
      description: description || '',
    }

    const updated = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      { $push: { 'resume.experiences': newExp } },
      { new: true }
    )

    res.status(201).json({
      success: true,
      message: 'سابقه تدریس با موفقیت اضافه شد',
      data: updated?.resume?.experiences,
    })
  } catch (error: any) {
    logger.error('❌ خطا در افزودن سابقه تدریس:', error)
    res.status(500).json({ success: false, message: 'خطا در ثبت سابقه تدریس' })
  }
}

/**
 * حذف سابقه شغلی
 */
export const deleteExperience = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id
    const { itemId } = req.params

    const updated = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      { $pull: { 'resume.experiences': { id: itemId } } },
      { new: true }
    )

    res.status(200).json({
      success: true,
      message: 'سابقه مورد نظر حذف شد',
      data: updated?.resume?.experiences,
    })
  } catch (error: any) {
    logger.error('❌ خطا در حذف سابقه تدریس:', error)
    res.status(500).json({ success: false, message: 'خطا در حذف سابقه' })
  }
}

/**
 * افزودن مدرک تحصیلی جدید
 */
export const addEducation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id
    const { degree, field, university, startDate, endDate, grade } = req.body

    if (!degree || !field || !university) {
      res.status(400).json({ success: false, message: 'مقطع، رشته و دانشگاه الزامی هستند' })
      return
    }

    const newEdu = {
      id: new Types.ObjectId().toString(),
      degree,
      field,
      university,
      startDate: startDate || '',
      endDate: endDate || '',
      grade: grade || '',
    }

    const updated = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      { $push: { 'resume.education': newEdu } },
      { new: true }
    )

    res.status(201).json({
      success: true,
      message: 'مدرک تحصیلی با موفقیت اضافه شد',
      data: updated?.resume?.education,
    })
  } catch (error: any) {
    logger.error('❌ خطا در ثبت مدرک تحصیلی:', error)
    res.status(500).json({ success: false, message: 'خطا در ثبت مدرک تحصیلی' })
  }
}

/**
 * حذف مدرک تحصیلی
 */
export const deleteEducation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id
    const { itemId } = req.params

    const updated = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      { $pull: { 'resume.education': { id: itemId } } },
      { new: true }
    )

    res.status(200).json({
      success: true,
      message: 'مدرک تحصیلی حذف شد',
      data: updated?.resume?.education,
    })
  } catch (error: any) {
    logger.error('❌ خطا در حذف مدرک تحصیلی:', error)
    res.status(500).json({ success: false, message: 'خطا در حذف مدرک' })
  }
}

/**
 * به‌روزرسانی مهارت‌ها
 */
export const updateSkills = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id
    const { skills } = req.body

    if (!Array.isArray(skills)) {
      res.status(400).json({ success: false, message: 'لیست مهارت‌ها باید آرایه باشد' })
      return
    }

    const updated = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      { $set: { 'resume.skills': skills } },
      { new: true }
    )

    res.status(200).json({
      success: true,
      message: 'مهارت‌ها با موفقیت ذخیره شدند',
      data: updated?.resume?.skills,
    })
  } catch (error: any) {
    logger.error('❌ خطا در ذخیره مهارت‌ها:', error)
    res.status(500).json({ success: false, message: 'خطا در ذخیره مهارت‌ها' })
  }
}

/**
 * افزودن گواهینامه یا دوره ضمن خدمت
 */
export const addCertificate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id
    const { title, issuer, year, hours } = req.body

    if (!title || !issuer) {
      res.status(400).json({ success: false, message: 'عنوان دوره و مرجع صادرکننده الزامی است' })
      return
    }

    const newCert = {
      id: new Types.ObjectId().toString(),
      title,
      issuer,
      year: year || '',
      hours: hours || '',
    }

    const updated = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      { $push: { 'resume.certificates': newCert } },
      { new: true }
    )

    res.status(201).json({
      success: true,
      message: 'گواهینامه با موفقیت اضافه شد',
      data: updated?.resume?.certificates,
    })
  } catch (error: any) {
    logger.error('❌ خطا در ثبت گواهینامه:', error)
    res.status(500).json({ success: false, message: 'خطا در ثبت گواهینامه' })
  }
}

/**
 * حذف گواهینامه
 */
export const deleteCertificate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id
    const { itemId } = req.params

    const updated = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      { $pull: { 'resume.certificates': { id: itemId } } },
      { new: true }
    )

    res.status(200).json({
      success: true,
      message: 'گواهینامه حذف شد',
      data: updated?.resume?.certificates,
    })
  } catch (error: any) {
    logger.error('❌ خطا در حذف گواهینامه:', error)
    res.status(500).json({ success: false, message: 'خطا در حذف گواهینامه' })
  }
}

/**
 * افزودن افتخار، تقدیرنامه یا مقاله
 */
export const addHonor = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id
    const { title, issuer, year, type } = req.body

    if (!title || !issuer) {
      res.status(400).json({ success: false, message: 'عنوان و مرجع اهداکننده الزامی است' })
      return
    }

    const newHonor = {
      id: new Types.ObjectId().toString(),
      title,
      issuer,
      year: year || '',
      type: type || 'تقدیرنامه',
    }

    const updated = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      { $push: { 'resume.honors': newHonor } },
      { new: true }
    )

    res.status(201).json({
      success: true,
      message: 'افتخار/تقدیرنامه با موفقیت اضافه شد',
      data: updated?.resume?.honors,
    })
  } catch (error: any) {
    logger.error('❌ خطا در ثبت افتخار:', error)
    res.status(500).json({ success: false, message: 'خطا در ثبت افتخار' })
  }
}

/**
 * حذف افتخار
 */
export const deleteHonor = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id
    const { itemId } = req.params

    const updated = await TeacherProfile.findOneAndUpdate(
      { user: userId },
      { $pull: { 'resume.honors': { id: itemId } } },
      { new: true }
    )

    res.status(200).json({
      success: true,
      message: 'افتخار مورد نظر حذف شد',
      data: updated?.resume?.honors,
    })
  } catch (error: any) {
    logger.error('❌ خطا در حذف افتخار:', error)
    res.status(500).json({ success: false, message: 'خطا در حذف افتخار' })
  }
}