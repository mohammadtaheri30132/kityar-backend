import { Request, Response } from 'express'
import { Exam } from '../../../core/models/Exam.js'
import { ExamSession } from '../../../core/models/ExamSession.js'
import { logger } from '../../../core/utils/logger.js'
import { StudentProfile } from '../../../core/models/StudentProfile.js'
import { User } from '../../../core/models/User.js';
/**
 * دریافت لیست تمام آزمون‌های یک دانش‌آموز (داشبورد دانش‌آموز)
 */
export const getMyExams = async (req: Request, res: Response): Promise<void> => {
  try {
    const identifier = (req as any).user?.identifier 

    if (!identifier) {
      res.status(401).json({ success: false, message: 'شناسه دانش‌آموز یافت نشد' })
      return
    }

    // ۱. پیدا کردن تمام آزمون‌هایی که این دانش‌آموز مجاز به شرکت در آن‌هاست
    const exams = await Exam.find({ allowedParticipants: identifier }).sort({ startTime: -1 })

    // ۲. پیدا کردن تمام نشست‌های این دانش‌آموز
    const sessions = await ExamSession.find({ participantIdentifier: identifier })

    const now = new Date()

    // ۳. دسته‌بندی و مپ کردن اطلاعات برای نمایش در اپلیکیشن
    const examList = exams.map((exam) => {
      const session = sessions.find((s) => s.exam.toString() === exam._id.toString())
      let currentStatus = 'unknown'
      let earnedScore = null

      // بررسی وضعیت‌های مختلف آزمون
      if (session?.status === 'finished' || (!exam.isActive && session)) {
        // اگر آزمون تمام شده باشد، وضعیت تصحیح را چک می‌کنیم
        if (session.gradingStatus === 'graded') {
          currentStatus = 'تصحیح شده'
          earnedScore = session.totalEarnedScore // فقط در صورت تصحیح شدن، نمره ارسال می‌شود
        } else {
          currentStatus = 'در انتظار تصحیح'
          earnedScore = null
        }
      } else if (session?.status === 'in-progress' && exam.isActive && now <= exam.endTime) {
        currentStatus = 'در حال برگزاری'
      } else if (!session && exam.isActive && now >= exam.startTime && now <= exam.endTime) {
        currentStatus = 'آماده شروع'
      } else if (now > exam.endTime || !exam.isActive) {
        currentStatus = 'از دست رفته' // آزمون تمام شده ولی دانش‌آموز شرکت نکرده است
      } else if (now < exam.startTime) {
        currentStatus = 'در آینده'
      }

      return {
        id: exam._id,
        title: exam.title,
        startTime: exam.startTime,
        endTime: exam.endTime,
        totalScore: exam.totalScore,
        status: currentStatus, // فرانت‌اند می‌تواند بر اساس این وضعیت، رنگ‌ها و دکمه‌ها را تغییر دهد
        earnedScore: earnedScore,
      }
    })

    res.status(200).json({
      success: true,
      data: examList,
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت لیست آزمون‌های دانش‌آموز:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

/**
 * ورود به آزمون (شروع یا ادامه آزمون)
 */
export const enterExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const identifier = (req as any).user?.identifier
    const { examId } = req.params

    if (!identifier) {
      res.status(401).json({ success: false, message: 'شناسه دانش‌آموز یافت نشد' })
      return
    }

    // ۱. بررسی وجود آزمون
    const exam = await Exam.findById(examId)
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد' })
      return
    }

    const now = new Date()

    // ۲. بررسی زمان‌بندی و فعال بودن آزمون
    if (!exam.isActive) {
      res.status(400).json({ success: false, message: 'این آزمون غیرفعال شده است' })
      return
    }
    if (now < exam.startTime) {
      res.status(400).json({ success: false, message: 'زمان شروع آزمون هنوز فرا نرسیده است' })
      return
    }
    if (now > exam.endTime) {
      res.status(400).json({ success: false, message: 'زمان این آزمون به پایان رسیده است' })
      return
    }

    // ۳. بررسی وضعیت نشست (Session)
    let session = await ExamSession.findOne({ exam: examId, participantIdentifier: identifier })

    if (session) {
      // اگر قبلاً آزمون را تمام کرده باشد
      if (session.status === 'finished') {
        res.status(400).json({ success: false, message: 'شما قبلاً این آزمون را به پایان رسانده‌اید' })
        return
      }
      // اگر وسط آزمون بوده (مثلاً اینترنتش قطع شده و دوباره برگشته)
      res.status(200).json({
        success: true,
        message: 'بازگشت به آزمون در حال برگزاری',
        data: {
          sessionId: session._id,
          currentQuestionIndex: session.currentQuestionIndex,
          answers: session.answers, // پاسخ‌های قبلی را به فرانت‌اند می‌دهیم تا بداند چه جواب‌هایی داده است
        },
      })
      return
    }

    // ۴. ایجاد نشست جدید برای اولین ورود
    const newSession = new ExamSession({
      exam: examId,
      participantIdentifier: identifier,
      status: 'in-progress',
      startTime: now,
      answers: [],
    })

    await newSession.save()

    res.status(201).json({
      success: true,
      message: 'آزمون با موفقیت شروع شد',
      data: {
        sessionId: newSession._id,
        currentQuestionIndex: 0,
        answers: [],
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در ورود به آزمون:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در شروع آزمون' })
  }
}
export const submitAnswer = async (req: Request, res: Response): Promise<void> => {
  try {
    const identifier = (req as any).user?.identifier
    const { examId } = req.params
    const { questionId, submittedAnswer, currentQuestionIndex } = req.body

    if (!identifier) {
      res.status(401).json({ success: false, message: 'شناسه دانش‌آموز یافت نشد' })
      return
    }

    if (!questionId || submittedAnswer === undefined) {
      res.status(400).json({ success: false, message: 'شناسه سوال و پاسخ ارسالی الزامی است' })
      return
    }

    // ۱. دریافت نشست فعلی و اطلاعات آزمون
    const session = await ExamSession.findOne({ exam: examId, participantIdentifier: identifier })
    const exam = await Exam.findById(examId)

    if (!session || !exam) {
      res.status(404).json({ success: false, message: 'آزمون یا نشست یافت نشد' })
      return
    }

    // ۲. اعتبارسنجی وضعیت آزمون و زمان
    if (session.status !== 'in-progress' || !exam.isActive) {
      res.status(400).json({ success: false, message: 'این آزمون به پایان رسیده و امکان ثبت پاسخ وجود ندارد' })
      return
    }

    const now = new Date()
    if (now > exam.endTime) {
      // اگر زمان گذشته باشد، آزمون را خودکار می‌بندیم
      session.status = 'finished'
      session.finishTime = now
      await session.save()
      res.status(400).json({ success: false, message: 'زمان آزمون به پایان رسیده است' })
      return
    }

    // ۳. بررسی قوانین بازگشت به عقب (برای حالت نمایش تکی)
    if (exam.deliveryMode === 'one_by_one' && !exam.allowBackNavigation) {
      // اگر کاربر سعی کند سوال قبلی را آپدیت کند
      if (currentQuestionIndex < session.currentQuestionIndex) {
        res.status(403).json({ success: false, message: 'امکان بازگشت و تغییر پاسخ سوالات قبلی وجود ندارد' })
        return
      }
    }

    // ۴. دریافت اطلاعات سوال از دیتابیس برای تصحیح خودکار
    const question = await Question.findById(questionId)
    let isCorrect = false
    
    // تصحیح خودکار فقط برای سوالات تستی (چندگزینه‌ای)
    if (question && question.type === 'تستی' && question.answer) {
      isCorrect = (question.answer === submittedAnswer)
    }

    // ۵. آپدیت یا ایجاد پاسخ در آرایه answers
    const answerIndex = session.answers.findIndex((a) => a.question.toString() === questionId)

    if (answerIndex > -1) {
      // ویرایش پاسخ قبلی
      session.answers[answerIndex].submittedAnswer = submittedAnswer
      session.answers[answerIndex].isCorrect = isCorrect
    } else {
      // ثبت پاسخ جدید
      session.answers.push({
        question: questionId,
        submittedAnswer,
        isCorrect,
        earnedScore: 0 // نمره بعدا توسط معلم یا سیستم محاسبه نهایی می‌شود
      })
    }

    // آپدیت ایندکس سوال فعلی (برای داشبورد معلم)
    if (currentQuestionIndex !== undefined && currentQuestionIndex > session.currentQuestionIndex) {
      session.currentQuestionIndex = currentQuestionIndex
    }

    await session.save()

    res.status(200).json({
      success: true,
      message: 'پاسخ با موفقیت ثبت شد',
      data: { isSaved: true } // نیازی به ارسال کل نشست نیست تا ترافیک سبک بماند
    })
  } catch (error: any) {
    logger.error('❌ خطا در ثبت پاسخ دانش‌آموز:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ثبت پاسخ' })
  }
}
export const finishExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const identifier = (req as any).user?.identifier
    const { examId } = req.params

    if (!identifier) {
      res.status(401).json({ success: false, message: 'شناسه دانش‌آموز یافت نشد' })
      return
    }

    // ۱. پیدا کردن نشست فعالِ دانش‌آموز برای این آزمون
    const session = await ExamSession.findOne({ 
      exam: examId, 
      participantIdentifier: identifier 
    })

    if (!session) {
      res.status(404).json({ success: false, message: 'نشست آزمونی برای شما یافت نشد' })
      return
    }

    // ۲. بررسی وضعیت نشست
    if (session.status === 'finished') {
      res.status(400).json({ success: false, message: 'شما قبلاً این آزمون را به پایان رسانده‌اید' })
      return
    }

    // ۳. تغییر وضعیت به پایان‌یافته و ثبت زمان دقیق
    session.status = 'finished'
    session.finishTime = new Date()

    // نکته: اگر بخواهید نمره سوالاتی که به صورت خودکار تصحیح شده‌اند (مثل تستی‌ها) را همین الان محاسبه کنید،
    // می‌توانید روی آرایه answers یک حلقه بزنید و نمرات را جمع کنید.
    // اما معمولاً این کار به یک سرویس جداگانه در بک‌اند سپرده می‌شود یا معلم بعداً نمره نهایی را تایید می‌کند.

    await session.save()

    res.status(200).json({
      success: true,
      message: 'آزمون شما با موفقیت ثبت نهایی شد. خسته نباشید!',
      data: {
        finishTime: session.finishTime,
        status: session.status
      }
    })

  } catch (error: any) {
    logger.error('❌ خطا در ثبت نهایی آزمون دانش‌آموز:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در پایان دادن به آزمون' })
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
// دریافت لیست سوالات آزمون (بدون پاسخ صحیح) برای نمایش حین آزمون
export const getExamQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const identifier = (req as any).user?.identifier
    const { examId } = req.params

    const session = await ExamSession.findOne({ exam: examId, participantIdentifier: identifier })
    if (!session || session.status !== 'in-progress') {
      res.status(403).json({ success: false, message: 'شما در حال حاضر نشست فعالی برای این آزمون ندارید' })
      return
    }

    // دریافت سوالات و حذف فیلد answer تا در شبکه (Network) قابل تقلب نباشد
    const exam = await Exam.findById(examId).populate({
      path: 'questions',
      select: 'question type options difficulty has_image source_image' // دقت کنید فیلد answer را نیاوردیم
    })

    res.status(200).json({ success: true, data: exam?.questions || [] })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

// مطمئن شوید که مدل User در بالای فایل ایمپورت شده باشد:
// import { User } from '../../../core/models/User.js';

export const startExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { examId } = req.params;

    // ۱. پیدا کردن کاربر و پروفایل دانش‌آموز
    const user = await User.findById(userId);
    const student = await StudentProfile.findOne({ user: userId });
    
    if (!user || !student) {
      res.status(403).json({ success: false, message: 'کاربر یافت نشد.' });
      return;
    }

    // ۲. بررسی وجود آزمون بدون ارسال پاسخ‌های صحیح
    const exam = await Exam.findById(examId).populate({
      path: 'questions',
      select: '-answer'
    });

    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد.' });
      return;
    }

    // ۳. بررسی دسترسی (آیا موبایل یا کد دانش‌آموزی در لیست مجاز هست؟)
// ۳. بررسی دسترسی (تبدیل تمام مقادیر به String برای مقایسه دقیق)
const participantsList = exam.allowedParticipants || [];
    
    // 💡 کلید حل مشکل اینجاست:
    const rawPhone = user.phoneNumber || user.username || '';
    const phoneStr = String(rawPhone).trim();
    
    const codeStr = student.studentCode ? String(student.studentCode).trim() : '';

    const isAllowed = participantsList.some((p: any) => {
      const pStr = String(p).trim();
      return pStr === phoneStr || (codeStr && pStr === codeStr);
    });

    if (!isAllowed) {
      console.log('❌ Access Denied - List:', participantsList, ' | Phone:', phoneStr, ' | Code:', codeStr);
      res.status(403).json({ success: false, message: 'شما مجاز به شرکت در این آزمون نیستید.' });
      return;
    }

    // ۴. بررسی زمان آزمون
    const now = new Date();
    if (!exam.isUntimed) {
      if (now < exam.startTime) {
        res.status(400).json({ success: false, message: 'زمان آزمون هنوز فرا نرسیده است.' });
        return;
      }
      if (now > exam.endTime) {
        res.status(400).json({ success: false, message: 'زمان این آزمون به پایان رسیده است.' });
        return;
      }
    }

// ۵. مدیریت نشست (Session) با استفاده از شماره استخراج شده
    let session = await ExamSession.findOne({ 
      exam: examId, 
      participantIdentifier: phoneStr // 👈 اینجا اصلاح شد
    });
    
    if (session && session.status === 'finished') {
      res.status(400).json({ success: false, message: 'شما قبلاً این آزمون را به پایان رسانده‌اید.' });
      return;
    }

    if (!session) {
      session = new ExamSession({
        exam: examId,
        participantIdentifier: phoneStr, // 👈 اینجا اصلاح شد
        startTime: new Date(),
        status: 'in-progress',
        answers: []
      });
      await session.save();
    }

    // ۶. ارسال اطلاعات سوالات به فرانت‌اند
    res.status(200).json({
      success: true,
      data: {
        title: exam.title,
        isUntimed: exam.isUntimed,
        endTime: exam.endTime,
        sessionId: session._id,
        questions: exam.questions
      }
    });

  } catch (error: any) {
    logger.error('❌ خطا در شروع آزمون:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت سوالات' });
  }
};

/**
 * API 2: ثبت نهایی پاسخ‌برگ
 */
export const submitExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { examId } = req.params;
    const { answers } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      res.status(403).json({ success: false, message: 'کاربر یافت نشد.' });
      return;
    }

    const rawPhone = user.phoneNumber || user.username || '';
    const phoneStr = String(rawPhone).trim();

    const session = await ExamSession.findOne({ 
      exam: examId, 
      participantIdentifier: phoneStr,
      status: 'in-progress' 
    });

    if (!session) {
      res.status(400).json({ 
        success: false, 
        message: 'نشست فعالی برای این آزمون یافت نشد یا قبلاً ثبت شده است.' 
      });
      return;
    }

    // 💡 حل مشکل: تغییر نام questionId به question برای همخوانی با دیتابیس
    const mappedAnswers = (answers || []).map((item: any) => ({
      question: item.questionId, // جاگذاری شناسه سوال در فیلد صحیح
      answer: String(item.answer || '').trim() 
    }));

    // ذخیره پاسخ‌های اصلاح‌شده
    session.answers = mappedAnswers;
    session.endTime = new Date();
    session.status = 'finished';
    
    await session.save();

    res.status(200).json({
      success: true,
      message: 'آزمون شما با موفقیت ثبت شد.'
    });

  } catch (error: any) {
    console.error('❌ خطا در ثبت نهایی آزمون:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ثبت آزمون.' });
  }
};
// تابع جدید برای دریافت اطلاعات اولیه آزمون (قبل از زدن دکمه شروع)
export const getExamInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { examId } = req.params;

    const exam = await Exam.findById(examId);
    if (!exam) {
      res.status(404).json({ success: false, message: 'آزمون یافت نشد.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        title: exam.title,
        isUntimed: exam.isUntimed,
        startTime: exam.startTime,
        endTime: exam.endTime
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};