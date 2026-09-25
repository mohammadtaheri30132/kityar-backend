import { Request, Response } from 'express'
import { Exam } from '../../../core/models/Exam.js'
import { TeacherProfile } from '../../../core/models/TeacherProfile.js'
import { logger } from '../../../core/utils/logger.js'
import { ExamSession } from '../../../core/models/ExamSession.js'
import { Classroom } from '../../../core/models/Classroom.js';
import { ClassMembership } from '../../../core/models/ClassMembership.js';
export const createExam = async (req: Request, res: Response): Promise<void> => {
  try {
    // فرض بر این است که میدلور احراز هویت (Auth Middleware)، آیدی کاربر لاگین شده را در req.user قرار داده است
    const userId = (req as any).user?.id

    if (!userId) {
      res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' })
      return
    }

    // پیدا کردن پروفایل معلم مرتبط با این کاربر
    const teacher = await TeacherProfile.findOne({ user: userId })
    if (!teacher) {
      res.status(403).json({ success: false, message: 'شما دسترسی معلم برای ساخت آزمون را ندارید' })
      return
    }

    // دریافت اطلاعات آزمون از بدنه درخواست (req.body)
    const {
      title,
      description,
      classId,
      startTime,
      endTime,
      allowedParticipants,
      questions,
      totalScore,
      randomizeQuestions,
      deliveryMode,
      allowBackNavigation,
      isUntimed
    } = req.body

    // ۱. اعتبارسنجی‌های اولیه
    if (!title || !startTime || !endTime || !questions || questions.length === 0) {
      res.status(400).json({ success: false, message: 'لطفاً فیلدهای ضروری (عنوان، زمان‌ها و لیست سوالات) را تکمیل کنید' })
      return
    }

    // بررسی منطقی بودن زمان‌ها
    const start = new Date(startTime)
    const end = new Date(endTime)
    if (end <= start) {
      res.status(400).json({ success: false, message: 'زمان پایان آزمون باید بعد از زمان شروع آن باشد' })
      return
    }

    // ادغام لیست دانش‌آموزان کلاس با لیست ارسال شده
    let finalAllowedParticipants = allowedParticipants || [];
    if (classId) {
      const memberships = await ClassMembership.find({ classId, status: 'ACTIVE' });
      const phones = memberships.map(m => m.studentPhone);
      finalAllowedParticipants = [...new Set([...finalAllowedParticipants, ...phones])];
    }

    // ۲. ساخت آزمون جدید
    const newExam = new Exam({
      teacher: teacher._id,
      classId,
      title,
      description,
      startTime: start,
      endTime: end,
      isUntimed,
      allowedParticipants: finalAllowedParticipants,
      questions,
      totalScore,
      randomizeQuestions,
      deliveryMode,
      allowBackNavigation,
      isActive: true, // آزمون در ابتدا فعال است
    })

    await newExam.save()

    // ۳. تولید لینک یکتای آزمون برای دانش‌آموزان
    // این لینک می‌تواند بر اساس دامین فرانت‌اند شما تنظیم شود
    const clientUrl = process.env.CLIENT_URL || 'https://kitayar.ir'
    const examLink = `${clientUrl}/exam/join/${newExam._id}`

    res.status(201).json({
      success: true,
      message: 'آزمون با موفقیت ایجاد شد',
      data: {
        exam: newExam,
        examLink: examLink, // معلم این لینک را کپی کرده و به دانش‌آموزان می‌دهد
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در ساخت آزمون:', error)
    res.status(500).json({
      success: false,
      message: 'خطای سرور در ایجاد آزمون',
      error: error.message,
    })
  }
}
export const createInitialExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    
    // دریافت اطلاعات پایه و آیدی کلاس از فرم تنظیمات
    const {
      title,
      description,
      startTime,
      endTime,
      classroomId, 
      totalScore,
      randomizeQuestions,
      deliveryMode,
      allowBackNavigation,
    } = req.body

    // ۱. بررسی دسترسی معلم
    const teacher = await TeacherProfile.findOne({ user: userId })
    if (!teacher) {
      res.status(403).json({ success: false, message: 'پروفایل معلم یافت نشد' })
      return
    }

    // ۲. بررسی وجود کلاس و استخراج لیست دانش‌آموزان
    if (!classroomId) {
      res.status(400).json({ success: false, message: 'انتخاب کلاس برای برگزاری آزمون الزامی است' })
      return
    }

    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacher._id })
    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس مورد نظر یافت نشد' })
      return
    }

    // ۳. اعتبارسنجی زمان‌ها
    const start = new Date(startTime)
    const end = new Date(endTime)
    if (end <= start) {
      res.status(400).json({ success: false, message: 'زمان پایان آزمون باید بعد از زمان شروع آن باشد' })
      return
    }

    // ۴. ساخت آزمون و کپی کردن لیست دانش‌آموزانِ کلاس در آزمون (Snapshot)
    // این کار باعث می‌شود اگر بعداً دانش‌آموزی از کلاس حذف شد، در سوابق این آزمونِ خاص تغییری ایجاد نشود
    const newExam = new Exam({
      teacher: teacher._id,
      classId: classroom._id,
      title,
      description,
      startTime: start,
      endTime: end,
      allowedParticipants: classroom.students, // کپی لیست مجاز از روی کلاس
      questions: [], // فعلاً خالی است تا در مرحله دوم پر شود
      totalScore: totalScore || 20,
      randomizeQuestions,
      deliveryMode,
      allowBackNavigation,
      isActive: true,
    })

    await newExam.save()

    res.status(201).json({
      success: true,
      message: 'تنظیمات اولیه آزمون با موفقیت ذخیره شد. حالا سوالات را اضافه کنید.',
      data: {
        examId: newExam._id, // این آیدی برای مرحله دوم استفاده می‌شود
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در ساخت اولیه آزمون:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ایجاد آزمون' })
  }
}
export const getExamDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { examId } = req.params

    // ۱. بررسی دسترسی معلم
    const teacher = await TeacherProfile.findOne({ user: userId })
    if (!teacher) {
      res.status(403).json({ success: false, message: 'شما دسترسی لازم را ندارید' })
      return
    }

    // ۲. دریافت اطلاعات آزمون
    // باید مطمئن شویم این آزمون متعلق به همین معلم است
    const exam = await Exam.findOne({ _id: examId, teacher: teacher._id })
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد یا متعلق به شما نیست' })
      return
    }

    // ۳. دریافت تمام نشست‌های (Sessions) مربوط به این آزمون
    const sessions = await ExamSession.find({ exam: examId }).populate('user', 'firstName lastName fatherName fullName');

    // ۴. ترکیب داده‌ها برای ساخت خروجی داشبورد
    const participantsStatusMap = new Map<string, any>()

    // فقط نشست‌های ایجاد شده (دانش‌آموزانی که وارد آزمون شده‌اند) را نشان می‌دهیم
    // (بنا به درخواست کاربر، دانش‌آموزانی که هنوز شرکت نکرده‌اند نمایش داده نمی‌شوند)

    // به‌روزرسانی با نشست‌های واقعی (چه در لیست مجاز بوده‌اند چه نبوده‌اند)
    sessions.forEach(session => {
      let status = 'در حال آزمون'
      if (session.status === 'finished') status = 'تمام کرده'
      
      const populatedUser = session.user as any;

      participantsStatusMap.set(session.participantIdentifier, {
        identifier: session.participantIdentifier,
        status,
        startTime: session.startTime,
        finishTime: session.finishTime,
        score: session.totalEarnedScore,
        currentQuestionIndex: session.currentQuestionIndex,
        sessionId: session._id,
        gradingStatus: session.gradingStatus,
        firstNameSnapshot: session.firstNameSnapshot || populatedUser?.firstName || '',
        lastNameSnapshot: session.lastNameSnapshot || populatedUser?.lastName || '',
        fatherNameSnapshot: session.fatherNameSnapshot || populatedUser?.fatherName || ''
      })
    })

    const participantsStatus = Array.from(participantsStatusMap.values())

    // ۵. ارسال اطلاعات به فرانت‌اند
    res.status(200).json({
      success: true,
      data: {
        examDetails: {
          title: exam.title,
          isActive: exam.isActive,
          startTime: exam.startTime,
          endTime: exam.endTime,
        },
        participantsStatus: participantsStatus, // لیست وضعیت تمام دانش‌آموزان
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت اطلاعات داشبورد آزمون:', error)
    res.status(500).json({
      success: false,
      message: 'خطای سرور در دریافت وضعیت دانش‌آموزان',
      error: error.message,
    })
  }
}

export const endExamManually = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { examId } = req.params

    // ۱. بررسی احراز هویت و دسترسی معلم
    const teacher = await TeacherProfile.findOne({ user: userId })
    if (!teacher) {
      res.status(403).json({ success: false, message: 'شما دسترسی لازم را ندارید' })
      return
    }

    // ۲. بررسی وجود آزمون و مالکیت آن
    const exam = await Exam.findOne({ _id: examId, teacher: teacher._id })
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد یا متعلق به شما نیست' })
      return
    }

    // اگر آزمون قبلاً غیرفعال شده باشد
    if (!exam.isActive) {
      res.status(400).json({ success: false, message: 'این آزمون قبلاً پایان یافته است' })
      return
    }

    // ۳. غیرفعال کردن کلی آزمون
    exam.isActive = false
    // در صورت نیاز، زمان پایان را هم به زمان فعلی تغییر می‌دهیم تا تاریخچه درست بماند
    exam.endTime = new Date() 
    await exam.save()

    // ۴. پایان دادن اجباری به نشست‌های فعال (Force Finish)
    // تمام دانش‌آموزانی که وسط آزمون بودند، وضعیتشان بسته می‌شود
    const updateResult = await ExamSession.updateMany(
      { exam: examId, status: 'in-progress' },
      { 
        $set: { 
          status: 'finished', 
          finishTime: new Date() 
        } 
      }
    )

    res.status(200).json({
      success: true,
      message: 'آزمون با موفقیت پایان یافت',
      data: {
        closedSessionsCount: updateResult.modifiedCount, // تعداد دانش‌آموزانی که سیستم آزمونشان را بست
      }
    })
  } catch (error: any) {
    logger.error('❌ خطا در پایان دادن دستی به آزمون:', error)
    res.status(500).json({
      success: false,
      message: 'خطای سرور در پایان دادن به آزمون',
      error: error.message,
    })
  }
}
/**
 * مرحله دوم: افزودن سوالات به آزمونی که قبلاً ساخته شده است
 */
export const addQuestionsToExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { examId } = req.params
    const { questionIds } = req.body // آرایه‌ای از آیدی سوالات [ "id1", "id2", ... ]

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      res.status(400).json({ success: false, message: 'لیست سوالات نمی‌تواند خالی باشد' })
      return
    }

    const teacher = await TeacherProfile.findOne({ user: userId })
    if (!teacher) {
      res.status(403).json({ success: false, message: 'شما دسترسی لازم را ندارید' })
      return
    }

    // بررسی اینکه آزمون وجود داشته باشد و متعلق به همین معلم باشد
    const exam = await Exam.findOne({ _id: examId, teacher: teacher._id })
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد' })
      return
    }

    // اگر آزمون شروع شده باشد، دیگر نباید اجازه تغییر سوالات را بدهیم (مگر اینکه هنوز سوالی نداشته باشد)
    // NOTE: Restriction removed based on user feedback to allow editing/adding during exam building.
    // if (exam.questions.length > 0 && new Date() >= exam.startTime) {
    //   res.status(400).json({ success: false, message: 'آزمون شروع شده یا به پایان رسیده است و امکان ویرایش سوالات وجود ندارد' })
    //   return
    // }

    // اضافه کردن سوالات به دیتابیس (استفاده از $addToSet برای جلوگیری از ثبت سوال تکراری)
    const updatedExam = await Exam.findByIdAndUpdate(
      examId,
      { 
        $addToSet: { questions: { $each: questionIds } } 
      },
      { new: true }
    )

    // ایجاد لینک یکتای ورود برای ارسال به دانش‌آموزان
    const clientUrl = process.env.CLIENT_URL || 'https://kitayar.ir'
    const examLink = `${clientUrl}/exam/join/${examId}`

    res.status(200).json({
      success: true,
      message: 'سوالات با موفقیت به آزمون اضافه شدند',
      data: {
        totalQuestions: updatedExam?.questions.length,
        examLink: examLink
      }
    })
  } catch (error: any) {
    logger.error('❌ خطا در افزودن سوال به آزمون:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * دریافت لیست تمام آزمون‌های یک معلم با مشخص شدن وضعیت آن‌ها
 */
export const getTeacherExams = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const teacher = await TeacherProfile.findOne({ user: userId })

    if (!teacher) {
      res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' })
      return
    }

    const { classroomId } = req.query;
    
    let query: any = { teacher: teacher._id };
    if (classroomId) {
      query.classId = classroomId;
    }

    const exams = await Exam.find(query)
      .populate('classId', 'name')
      .sort({ startTime: -1 })
    const now = new Date()

    const examList = exams.map(exam => {
      let status = 'نامشخص'
      
      if (!exam.isActive) {
        status = 'پایان‌یافته'
      } else if (now < exam.startTime) {
        status = 'در آینده' // هنوز شروع نشده
      } else if (now >= exam.startTime && now <= exam.endTime) {
        status = 'در حال برگزاری'
      } else if (now > exam.endTime) {
        status = 'پایان‌یافته'
      }

      return {
        id: exam._id,
        title: exam.title,
        startTime: exam.startTime,
        endTime: exam.endTime,
        participantsCount: exam.allowedParticipants.length, // تعداد دانش‌آموزانِ مجاز
        questionsCount: exam.questions.length, // تعداد سوالاتِ الصاق شده
        status,
        classId: exam.classId?._id || exam.classId,
        className: (exam.classId as any)?.name || 'بدون کلاس'
      }
    })

    res.status(200).json({
      success: true,
      data: examList,
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت تاریخچه آزمون‌ها:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * ویرایش تنظیمات آزمون (فقط قبل از شروع آزمون امکان‌پذیر است)
 */
export const updateExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { examId } = req.params

    // 💡 متغیر isUntimed اینجا اضافه شد
    const {
      title, description, startTime, endTime, totalScore, 
      randomizeQuestions, deliveryMode, allowBackNavigation, isUntimed
    } = req.body

    const teacher = await TeacherProfile.findOne({ user: userId })
    if (!teacher) {
      res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' })
      return
    }

    const exam = await Exam.findOne({ _id: examId, teacher: teacher._id })
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد' })
      return
    }

    // گارد امنیتی: اگر آزمون زمان‌دار است و قبلاً شروع شده، اجازه ویرایش نده
    if (!exam.isUntimed && exam.startTime && new Date() >= exam.startTime) {
      res.status(400).json({ 
        success: false, 
        message: 'آزمون شروع شده است و امکان ویرایش تنظیمات وجود ندارد' 
      })
      return
    }

    // اعمال تغییرات
    if (title) exam.title = title
    if (totalScore) exam.totalScore = totalScore
    if (isUntimed !== undefined) exam.isUntimed = isUntimed

    // اگر آزمون آزاد نیست، زمان‌های جدید را هم ذخیره کن
    if (!isUntimed && startTime && endTime) {
      const start = new Date(startTime)
      const end = new Date(endTime)
      if (end <= start) {
        res.status(400).json({ success: false, message: 'زمان پایان باید بعد از زمان شروع باشد' })
        return
      }
      exam.startTime = start
      exam.endTime = end
    }

    await exam.save()

    res.status(200).json({
      success: true,
      message: 'تنظیمات آزمون با موفقیت ویرایش شد',
      data: exam,
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطای سرور در ویرایش آزمون' })
  }
}
/**
 * حذف کامل آزمون (فقط قبل از شروع آزمون امکان‌پذیر است)
 */
export const deleteExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { examId } = req.params

    // ۱. بررسی دسترسی معلم
    const teacher = await TeacherProfile.findOne({ user: userId })
    if (!teacher) {
      res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' })
      return
    }

    // ۲. پیدا کردن آزمون
    const exam = await Exam.findOne({ _id: examId, teacher: teacher._id })
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد' })
      return
    }

    // (برداشتن گارد زمانی جهت اجازه حذف در هر زمان)

    // ۴. حذف آزمون از دیتابیس
    await exam.deleteOne()

    res.status(200).json({
      success: true,
      message: 'آزمون با موفقیت حذف شد',
    })
  } catch (error: any) {
    logger.error('❌ خطا در حذف آزمون:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در حذف آزمون' })
  }
}


// ... سایر ایمپورت‌ها

/**
 * دریافت پاسخ‌های یک دانش‌آموز خاص برای تصحیح
 */
export const getStudentSessionForGrading = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { examId, sessionId } = req.params

    const teacher = await TeacherProfile.findOne({ user: userId })
    if (!teacher) {
      res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' })
      return
    }

    // بررسی اینکه آزمون متعلق به همین معلم باشد
    const exam = await Exam.findOne({ _id: examId, teacher: teacher._id })
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد' })
      return
    }

    // دریافت نشست و جوین کردن با مدل سوالات برای نمایش متن سوال به معلم
    const session = await ExamSession.findOne({ _id: sessionId, exam: examId })
      .populate('answers.question', 'question type answer options matching_left matching_right') // دریافت فیلدهای مهم سوال[cite: 5]

    if (!session) {
      res.status(404).json({ success: false, message: 'پاسخ‌برگ دانش‌آموز یافت نشد' })
      return
    }

    res.status(200).json({
      success: true,
      data: session,
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت پاسخ‌برگ:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * ثبت نمره نهایی دانش‌آموز توسط معلم
 */
export const submitStudentGrade = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { examId, sessionId } = req.params
    const { finalScore } = req.body // نمره‌ای که معلم وارد کرده است

    if (finalScore === undefined) {
      res.status(400).json({ success: false, message: 'وارد کردن نمره نهایی الزامی است' })
      return
    }

    const teacher = await TeacherProfile.findOne({ user: userId })
    if (!teacher) {
      res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' })
      return
    }

    const exam = await Exam.findOne({ _id: examId, teacher: teacher._id })
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد' })
      return
    }

    const session = await ExamSession.findOne({ _id: sessionId, exam: examId })
    if (!session) {
      res.status(404).json({ success: false, message: 'پاسخ‌برگ دانش‌آموز یافت نشد' })
      return
    }

    if (session.status !== 'finished') {
      res.status(400).json({ success: false, message: 'دانش‌آموز هنوز آزمون را به پایان نرسانده است' })
      return
    }

    // ثبت نمره و تغییر وضعیت به تصحیح‌شده
    session.totalEarnedScore = finalScore
    session.gradingStatus = 'graded'
    await session.save()

    res.status(200).json({
      success: true,
      message: 'نمره دانش‌آموز با موفقیت ثبت شد',
      data: {
        totalEarnedScore: session.totalEarnedScore,
        gradingStatus: session.gradingStatus
      }
    })
  } catch (error: any) {
    logger.error('❌ خطا در ثبت نمره:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * مشاهده جزئیات کارنامه و مرور پاسخ‌ها (فقط پس از تصحیح نهایی)
 */
export const getExamReportCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const identifier = (req as any).user?.identifier
    const { examId } = req.params

    if (!identifier) {
      res.status(401).json({ success: false, message: 'شناسه دانش‌آموز یافت نشد' })
      return
    }

    // ۱. دریافت اطلاعات کلی آزمون (برای نمایش عنوان و نمره کل در هدر کارنامه)
    const exam = await Exam.findById(examId).select('title totalScore')
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون مورد نظر یافت نشد' })
      return
    }

    // ۲. پیدا کردن نشست آزمون با جزئیات سوالات
    const session = await ExamSession.findOne({
      exam: examId,
      participantIdentifier: identifier,
    }).populate({
      path: 'answers.question',
      select: 'question type options answer has_image source_image difficulty' // فیلدهای مورد نیاز برای نمایش در کارنامه
    })

    if (!session) {
      res.status(404).json({ success: false, message: 'پاسخ‌برگ شما یافت نشد' })
      return
    }

    // ۳. گارد امنیتی: بررسی وضعیت تصحیح
    if (session.status !== 'finished') {
      res.status(400).json({ success: false, message: 'شما هنوز این آزمون را به پایان نرسانده‌اید' })
      return
    }

    if (session.gradingStatus !== 'graded') {
      res.status(403).json({ 
        success: false, 
        message: 'کارنامه این آزمون هنوز صادر نشده و در انتظار تصحیح توسط معلم است' 
      })
      return
    }

    // ۴. ساختاربندی اطلاعات کارنامه برای فرانت‌اند
    const reportDetails = session.answers.map((ans) => {
      // به دلیل استفاده از populate، این فیلد اکنون حاوی آبجکت کامل سوال است
      const q = ans.question as any 

      return {
        questionId: q._id,
        questionText: q.question,
        type: q.type,
        options: q.options || [],
        hasImage: q.has_image,
        sourceImage: q.source_image,
        
        submittedAnswer: ans.submittedAnswer, // پاسخی که دانش‌آموز داده
        correctAnswer: q.answer, // پاسخ صحیح که در سیستم ثبت شده
        isCorrect: ans.isCorrect, // وضعیت درستی/نادرستی
        earnedScore: ans.earnedScore, // نمره‌ای که برای این سوال خاص گرفته است
      }
    })

    // ۵. ارسال اطلاعات کامل کارنامه
    res.status(200).json({
      success: true,
      data: {
        header: {
          examTitle: exam.title,
          totalScore: exam.totalScore,
          earnedScore: session.totalEarnedScore,
          finishTime: session.finishTime,
        },
        details: reportDetails // لیست تک‌تک سوالات برای مرور
      }
    })

  } catch (error: any) {
    logger.error('❌ خطا در دریافت کارنامه دانش‌آموز:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت کارنامه' })
  }
}


// به‌روزرسانی لیست سوالات یک آزمون (ویرایش آزمون)
export const updateExamQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const { questionIds } = req.body;

    if (!Array.isArray(questionIds)) {
      res.status(400).json({ success: false, message: 'لیست سوالات نامعتبر است' });
      return;
    }

    // پیدا کردن آزمون در دیتابیس
    const exam = await Exam.findById(examId);
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد' });
      return;
    }

    // گارد امنیتی: آیا آزمون شروع شده است؟
    const now = new Date();
    if (exam.startTime && now >= exam.startTime) {
      res.status(403).json({ 
        success: false, 
        message: 'این آزمون در حال برگزاری یا پایان‌یافته است و نمی‌توانید سوالات آن را ویرایش کنید.' 
      });
      return;
    }

    // جایگزین کردن سوالات جدید و بروزرسانی تعداد
    exam.questions = questionIds;
    exam.questionsCount = questionIds.length;
    
    await exam.save();

    res.status(200).json({
      success: true,
      message: 'سوالات آزمون با موفقیت بروزرسانی شد',
      data: exam
    });

  } catch (error: any) {
    logger.error('❌ خطا در ویرایش سوالات آزمون:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ویرایش آزمون' });
  }
};

// دریافت جزئیات یک آزمون خاص (استفاده شده در داشبورد و صفحه ویرایش)
export const getExamById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { examId } = req.params;

    // پیدا کردن پروفایل معلم
    const teacher = await TeacherProfile.findOne({ user: userId });
    if (!teacher) {
      res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
      return;
    }

    // پیدا کردن آزمون و populate کردن سوالات
    const exam = await Exam.findOne({ _id: examId, teacher: teacher._id }).populate('questions');

    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد' });
      return;
    }

    res.status(200).json({
      success: true,
      data: exam
    });

  } catch (error: any) {
    logger.error('❌ خطا در دریافت جزئیات آزمون:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت اطلاعات آزمون' });
  }
};

// افزودن دانش‌آموزان جدید به لیست مجازِ آزمون
export const addParticipantsToExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const { phoneNumbers } = req.body; // آرایه‌ای از شماره موبایل‌ها ['0912...']

    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      res.status(400).json({ success: false, message: 'لیست شماره‌ها نامعتبر است' });
      return;
    }

    const exam = await Exam.findById(examId);
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد' });
      return;
    }

    // اضافه کردن شماره‌ها به لیست بدون ایجاد تکرار (استفاده از Set یا $addToSet در مانگوس)
    const newParticipants = phoneNumbers.filter(phone => !exam.allowedParticipants.includes(phone));
    
    if (newParticipants.length > 0) {
      exam.allowedParticipants.push(...newParticipants);
      await exam.save();
    }

    res.status(200).json({
      success: true,
      message: 'دانش‌آموزان با موفقیت به آزمون اضافه شدند',
      data: exam.allowedParticipants
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};
export const previewFinalizeExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findById(examId);
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد' });
      return;
    }

    const sessions = await ExamSession.find({ exam: examId, status: 'finished' }).populate('user', 'firstName lastName fatherName');
    const memberships = await ClassMembership.find({ classId: exam.classId });
    const classPhones = memberships.map(m => m.studentPhone);

    const matched = [];
    const unmatched = [];

    for (const session of sessions) {
      // Create a mapped session to ensure names are present
      const populatedUser = session.user as any;
      const mappedSession = {
        ...session.toObject(),
        firstNameSnapshot: session.firstNameSnapshot || populatedUser?.firstName || '',
        lastNameSnapshot: session.lastNameSnapshot || populatedUser?.lastName || '',
        fatherNameSnapshot: session.fatherNameSnapshot || populatedUser?.fatherName || ''
      };

      if (classPhones.includes(session.participantIdentifier)) {
        matched.push(mappedSession);
      } else {
        unmatched.push(mappedSession);
      }
    }

    res.status(200).json({ success: true, data: { matched, unmatched, classMembers: memberships } });
  } catch (error) {
    logger.error('Error preview finalize:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};

export const finalizeExamGrades = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const { actions } = req.body; // [{ sessionId, action: 'NEW' | 'LINK', targetPhone }]
    
    const exam = await Exam.findById(examId);
    if (!exam) return;

    if (actions && Array.isArray(actions)) {
      for (const action of actions) {
        const session = await ExamSession.findById(action.sessionId).populate('user', 'firstName lastName fatherName');
        if (!session) continue;
        
        const populatedUser = session.user as any;

        if (action.action === 'NEW') {
          // Add to class
          const existing = await ClassMembership.findOne({ classId: exam.classId, studentPhone: session.participantIdentifier });
          if (!existing) {
            await ClassMembership.create({
              classId: exam.classId,
              studentPhone: session.participantIdentifier,
              firstName: session.firstNameSnapshot || populatedUser?.firstName,
              lastName: session.lastNameSnapshot || populatedUser?.lastName,
              fatherName: session.fatherNameSnapshot || populatedUser?.fatherName,
              status: 'ACTIVE',
              source: 'EXAM_LINK'
            });
          }
          session.matchingStatus = 'MATCHED';
          await session.save();
        } else if (action.action === 'LINK') {
          // Change session participantIdentifier to match the class student
          session.participantIdentifier = action.targetPhone;
          session.matchingStatus = 'MATCHED';
          await session.save();
        }
      }
    }

    res.status(200).json({ success: true, message: 'نمرات با موفقیت ثبت و دانش‌آموزان به کلاس اضافه شدند' });
  } catch (error) {
    logger.error('Error finalize:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};
