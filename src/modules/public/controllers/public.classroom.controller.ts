import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { Classroom } from '../../../core/models/Classroom.js'
import { ClassMembership } from '../../../core/models/ClassMembership.js'
import { User } from '../../../core/models/User.js'
import { StudentProfile } from '../../../core/models/StudentProfile.js'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { logger } from '../../../core/utils/logger.js'

/**
 * دریافت اطلاعات عمومی یک کلاس جهت نمایش در صفحه ثبت‌نام وب
 */
export const getPublicClassroomInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params

    if (!code) {
      res.status(400).json({ success: false, message: 'شناسه کلاس الزامی است' })
      return
    }

    const classroom = await Classroom.findOne({ code, isActive: true })
      .populate('teacher')
      .populate('school', 'name')
      .populate('course', 'name code')
      .populate('grade', 'name')

    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاسی با این شناسه یافت نشد یا غیرفعال است.' })
      return
    }

    // استخراج نام کامل معلم
    let teacherName = 'معلم محترم'
    if (classroom.teacher) {
      const teacherUser = await User.findById((classroom.teacher as any).user)
      if (teacherUser) {
        teacherName = teacherUser.fullName || `${teacherUser.firstName || ''} ${teacherUser.lastName || ''}`.trim()
      }
    }

    res.status(200).json({
      success: true,
      data: {
        id: classroom._id,
        code: classroom.code,
        className: classroom.name,
        teacherName,
        schoolName: (classroom.school as any)?.name || '',
        subjectName: (classroom.course as any)?.name || classroom.subjectName || '',
        gradeName: (classroom.grade as any)?.name || classroom.gradeName || '',
        academicYear: classroom.academicYear || '',
        description: classroom.description || '',
        studentCount: classroom.students?.length || 0,
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت اطلاعات عمومی کلاس:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت اطلاعات کلاس' })
  }
}

/**
 * ارسال کد تایید پیامکی (OTP استاتیک طبق درخواست)
 */
export const sendStudentOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, code } = req.body

    if (!phone || !phone.match(/^09\d{9}$/)) {
      res.status(400).json({ success: false, message: 'شماره موبایل وارد شده نامعتبر است (مثال: 09123456789)' })
      return
    }

    if (!code) {
      res.status(400).json({ success: false, message: 'شناسه کلاس الزامی است' })
      return
    }

    const classroom = await Classroom.findOne({ code, isActive: true })
    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس مورد نظر یافت نشد.' })
      return
    }

    const existingMembership = await ClassMembership.findOne({
      classId: classroom._id,
      studentPhone: phone,
    })

    // کد تایید استاتیک
    const staticOtp = '1234'
    logger.info(`📱 درخواست OTP دانش‌آموز برای شماره ${phone} (کلاس: ${code}): کد ${staticOtp}`)

    res.status(200).json({
      success: true,
      message: 'کد تایید با موفقیت ارسال شد',
      staticOtp,
      alreadyRegistered: !!existingMembership,
      studentName: existingMembership ? `${existingMembership.firstName || ''} ${existingMembership.lastName || ''}`.trim() : null,
    })
  } catch (error: any) {
    logger.error('❌ خطا در ارسال کد تایید:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ارسال کد تایید' })
  }
}

/**
 * اعتبارسنجی کد تایید OTP و استخراج اطلاعات قبلی دانش‌آموز در صورت وجود
 */
export const verifyStudentOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, otp, code } = req.body

    if (!phone || !otp) {
      res.status(400).json({ success: false, message: 'شماره موبایل و کد تایید الزامی هستند' })
      return
    }

    if (otp !== '1234') {
      res.status(400).json({ success: false, message: 'کد تایید وارد شده نادرست است' })
      return
    }

    let existingData: any = null

    // بررسی آیا قبلاً در عضویتی اطلاعات ثبت کرده است
    const prevMembership = await ClassMembership.findOne({ studentPhone: phone }).sort({ createdAt: -1 })
    if (prevMembership) {
      existingData = {
        firstName: prevMembership.firstName || '',
        lastName: prevMembership.lastName || '',
        fatherName: prevMembership.fatherName || '',
        parentPhone: prevMembership.parentPhone || '',
        birthDate: prevMembership.birthDate || '',
        specialNotes: prevMembership.specialNotes || '',
      }
    } else {
      const existingUser = await User.findOne({ phoneNumber: phone })
      if (existingUser) {
        existingData = {
          firstName: existingUser.firstName || '',
          lastName: existingUser.lastName || '',
          fatherName: existingUser.fatherName || '',
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'کد تایید احراز شد',
      verified: true,
      existingData,
    })
  } catch (error: any) {
    logger.error('❌ خطا در تایید کد OTP:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در اعتبارسنجی کد' })
  }
}

/**
 * ثبت‌نام نهایی دانش‌آموز در کلاس درس و افزودن به لیست معلم
 */
export const registerStudentInClassroom = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      code,
      phone,
      otp,
      firstName,
      lastName,
      fatherName,
      studentCode,
      parentPhone,
      birthDate,
      specialNotes,
    } = req.body

    if (!code) {
      res.status(400).json({ success: false, message: 'شناسه کلاس الزامی است' })
      return
    }

    if (!phone || !phone.match(/^09\d{9}$/)) {
      res.status(400).json({ success: false, message: 'شماره موبایل نامعتبر است' })
      return
    }

    if (otp !== '1234') {
      res.status(400).json({ success: false, message: 'کد تایید پیامکی نامعتبر است' })
      return
    }

    if (!firstName?.trim() || !lastName?.trim() || !fatherName?.trim()) {
      res.status(400).json({ success: false, message: 'نام، نام خانوادگی و نام پدر الزامی هستند' })
      return
    }

    if (parentPhone && !parentPhone.match(/^09\d{9}$/)) {
      res.status(400).json({ success: false, message: 'شماره والدین نامعتبر است (مثال: 09123456789)' })
      return
    }

    const classroom = await Classroom.findOne({ code, isActive: true }).populate('teacher')
    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس مورد نظر یافت نشد' })
      return
    }

    // ۱. ایجاد یا به‌روزرسانی User و StudentProfile
    let user = await User.findOne({ phoneNumber: phone })
    if (!user) {
      const hashedPassword = await bcrypt.hash('123456', 10)
      user = new User({
        username: phone,
        phoneNumber: phone,
        fullName: `${firstName.trim()} ${lastName.trim()}`,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        fatherName: fatherName.trim(),
        role: 'student',
        password: hashedPassword,
        isActive: true,
      })
      await user.save()
    } else {
      user.firstName = firstName.trim()
      user.lastName = lastName.trim()
      user.fatherName = fatherName.trim()
      user.fullName = `${firstName.trim()} ${lastName.trim()}`
      await user.save()
    }

    let studentProfile = await StudentProfile.findOne({ user: user._id })
    if (!studentProfile) {
      studentProfile = new StudentProfile({
        user: user._id,
        studentCode: studentCode?.trim() || phone,
        teachers: classroom.teacher ? [(classroom.teacher as any)._id] : [],
        invitedBy: classroom.teacher ? (classroom.teacher as any)._id : undefined,
      })
      await studentProfile.save()
    } else {
      if (classroom.teacher && !studentProfile.teachers.some((t: any) => t.toString() === (classroom.teacher as any)._id.toString())) {
        studentProfile.teachers.push((classroom.teacher as any)._id)
        await studentProfile.save()
      }
    }

    // ۲. ایجاد یا به‌روزرسانی ClassMembership با وضعیت PENDING (در انتظار تایید معلم)
    let membership = await ClassMembership.findOne({
      classId: classroom._id,
      studentPhone: phone,
    })

    if (!membership) {
      membership = new ClassMembership({
        classId: classroom._id,
        studentId: studentProfile._id,
        studentPhone: phone,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        fatherName: fatherName.trim(),
        parentPhone: parentPhone?.trim() || undefined,
        birthDate: birthDate?.trim() || undefined,
        specialNotes: specialNotes?.trim() || undefined,
        status: 'PENDING',
        source: 'INVITATION',
        isVerified: false,
        joinedAt: new Date(),
      })
      await membership.save()
    } else {
      membership.studentId = studentProfile._id
      membership.firstName = firstName.trim()
      membership.lastName = lastName.trim()
      membership.fatherName = fatherName.trim()
      if (parentPhone) membership.parentPhone = parentPhone.trim()
      if (birthDate) membership.birthDate = birthDate.trim()
      if (specialNotes) membership.specialNotes = specialNotes.trim()
      membership.status = 'PENDING'
      membership.source = 'INVITATION'
      membership.isVerified = false
      await membership.save()
    }

    // استخراج نام معلم برای پیام موفقیت
    let teacherName = 'معلم کلاس'
    if (classroom.teacher) {
      const teacherUser = await User.findById((classroom.teacher as any).user)
      if (teacherUser) {
        teacherName = teacherUser.fullName || `${teacherUser.firstName || ''} ${teacherUser.lastName || ''}`.trim()
      }
    }

    logger.info(`📥 درخواست عضویت جدید از دانش‌آموز ${firstName} ${lastName} (${phone}) برای کلاس ${classroom.name} (کد: ${code}) ثبت شد.`)

    res.status(200).json({
      success: true,
      message: 'درخواست عضویت شما با موفقیت ثبت شد و پس از تایید معلم فعال خواهد شد.',
      data: {
        className: classroom.name,
        teacherName,
        student: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone,
        },
        nokitaDownload: {
          appName: 'نوکیتا (Nokita)',
          title: 'دانلود نرم‌افزار نوکیتا (اختصاصی دانش‌آموزان)',
          description: 'برای دسترسی به برنامه کلاسی، نمرات، تکالیف و آزمون‌های آنلاین، نرم‌افزار نوکیتا را نصب کنید.',
          directApkUrl: 'https://kitayar.ir/download/nokita.apk',
          bazaarUrl: 'https://cafebazaar.ir/app/com.kitayar.nokita',
          myketUrl: 'https://myket.ir/app/com.kitayar.nokita',
          webAppUrl: 'https://nokita.kitayar.ir',
        },
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در ثبت‌نام دانش‌آموز در کلاس:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ثبت‌نام دانش‌آموز' })
  }
}
