import { Request, Response } from 'express';
import crypto from 'crypto';
import { ExamSheet, IExamSheet, IRecognizedAnswer } from '../../../core/models/ExamSheet.js';
import { Exam } from '../../../core/models/Exam.js';
import { ExamSession } from '../../../core/models/ExamSession.js';
import { Classroom } from '../../../core/models/Classroom.js';
import { ClassMembership } from '../../../core/models/ClassMembership.js';
import { GradebookRecord } from '../../../core/models/GradebookRecord.js';
import { TeacherProfile } from '../../../core/models/TeacherProfile.js';
import { logger } from '../../../core/utils/logger.js';

// Helper to generate a unique readable sheet code, e.g. "KIT-7482-9301"
const generateUniqueSheetCode = async (): Promise<string> => {
  let isUnique = false;
  let code = '';
  while (!isUnique) {
    const p1 = Math.floor(1000 + Math.random() * 9000);
    const p2 = Math.floor(1000 + Math.random() * 9000);
    code = `KIT-${p1}-${p2}`;
    const existing = await ExamSheet.findOne({ sheetCode: code });
    if (!existing) {
      isUnique = true;
    }
  }
  return code;
};

/**
 * ایجاد آزمون تستی هوشمند جدید یا تنظیم پاسخ‌برگ برای آزمون
 */
export const createSmartExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const teacher = await TeacherProfile.findOne({ user: userId });
    if (!teacher) {
      res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
      return;
    }

    const {
      title,
      subject,
      classId,
      examDate,
      totalQuestions,
      optionsPerQuestion = 4,
      pointsPerQuestion = 1,
      negativeMarking = false,
      negativeFactor = 0.33,
      maxScore = 20,
      templateId = 'MODEL_1',
      optionLabelType = 'ALPHABETIC',
      answerKey = [],
    } = req.body;

    if (!title || !classId || !totalQuestions) {
      res.status(400).json({
        success: false,
        message: 'عنوان، کلاس و تعداد سوالات الزامی هستند',
      });
      return;
    }

    // بررسی تعلق کلاس به معلم
    const classroom = await Classroom.findOne({ _id: classId, teacher: teacher._id });
    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس مورد نظر یافت نشد' });
      return;
    }

    // ایجاد یک رکورد Exam رسمی در صورت نیاز برای یکپارچگی با کل سیستم
    const exam = new Exam({
      teacher: teacher._id,
      classId: classroom._id,
      title,
      description: `آزمون تستی پاسخ‌برگ هوشمند - درس ${subject || classroom.name}`,
      isUntimed: true,
      startTime: new Date(),
      endTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // ۳۰ روز مهلت
      isActive: true,
      totalScore: maxScore,
      questionsCount: totalQuestions,
      allowedParticipants: [],
    });
    await exam.save();

    res.status(201).json({
      success: true,
      message: 'آزمون تستی با موفقیت ایجاد شد',
      data: {
        examId: exam._id,
        title,
        subject: subject || classroom.name,
        classId: classroom._id,
        className: classroom.name,
        examDate,
        totalQuestions,
        optionsPerQuestion,
        pointsPerQuestion,
        negativeMarking,
        negativeFactor,
        maxScore,
        templateId,
        optionLabelType,
        answerKey,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در ایجاد آزمون هوشمند:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ایجاد آزمون', error: error.message });
  }
};

/**
 * تولید پاسخ‌برگ‌های اختصاصی برای دانش‌آموزان انتخاب‌شده یک کلاس
 */
export const generateSheetsForStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const teacher = await TeacherProfile.findOne({ user: userId });
    if (!teacher) {
      res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
      return;
    }

    const {
      examId,
      classId,
      examTitle,
      subject,
      examDate,
      totalQuestions,
      optionsPerQuestion = 4,
      pointsPerQuestion = 1,
      negativeMarking = false,
      negativeFactor = 0.33,
      maxScore = 20,
      templateId = 'MODEL_1',
      optionLabelType = 'ALPHABETIC',
      answerKey = [],
      selectedStudents = [], // [{ phone, name }]
    } = req.body;

    if (!classId || !selectedStudents || selectedStudents.length === 0) {
      res.status(400).json({
        success: false,
        message: 'کلاس و حداقل یک دانش‌آموز باید انتخاب شوند',
      });
      return;
    }

    const classroom = await Classroom.findOne({ _id: classId, teacher: teacher._id });
    if (!classroom) {
      res.status(404).json({ success: false, message: 'کلاس معتبر نیست یا متعلق به شما نیست' });
      return;
    }

    const generatedSheets: any[] = [];

    for (const st of selectedStudents) {
      const studentPhone = st.phone || st.studentPhone;
      const studentName = st.name || st.studentName || 'دانش‌آموز';

      // بررسی آیا پاسخ‌برگی قبلاً برای این دانش‌آموز و آزمون صادر شده یا خیر
      let sheet: IExamSheet | null = null;
      if (examId) {
        sheet = await ExamSheet.findOne({
          exam: examId,
          studentPhone,
          teacher: teacher._id,
        });
      }

      if (!sheet) {
        const sheetCode = await generateUniqueSheetCode();
        sheet = new ExamSheet({
          sheetCode,
          teacher: teacher._id,
          classroom: classroom._id,
          exam: examId || undefined,
          studentPhone,
          studentName,
          examTitle: examTitle || 'آزمون تستی هوشمند',
          subject: subject || classroom.name,
          examDate: examDate || new Date().toISOString().split('T')[0],
          totalQuestions,
          optionsPerQuestion,
          pointsPerQuestion,
          negativeMarking,
          negativeFactor,
          maxScore,
          templateId: templateId || 'MODEL_1',
          optionLabelType: optionLabelType || 'ALPHABETIC',
          answerKey,
          status: 'PENDING',
        });
        await sheet.save();
      } else {
        // به‌روزرسانی مشخصات آزمون و کلید در صورت ویرایش
        sheet.answerKey = answerKey;
        sheet.totalQuestions = totalQuestions;
        sheet.optionsPerQuestion = optionsPerQuestion;
        sheet.pointsPerQuestion = pointsPerQuestion;
        sheet.negativeMarking = negativeMarking;
        sheet.negativeFactor = negativeFactor;
        sheet.maxScore = maxScore;
        sheet.templateId = templateId || sheet.templateId || 'MODEL_1';
        sheet.optionLabelType = optionLabelType || sheet.optionLabelType || 'ALPHABETIC';
        sheet.examTitle = examTitle || sheet.examTitle;
        await sheet.save();
      }

      generatedSheets.push({
        sheetId: sheet._id,
        sheetCode: sheet.sheetCode,
        studentPhone: sheet.studentPhone,
        studentName: sheet.studentName,
        templateId: sheet.templateId || templateId || 'MODEL_1',
        optionLabelType: sheet.optionLabelType || optionLabelType || 'ALPHABETIC',
        status: sheet.status,
      });
    }

    res.status(200).json({
      success: true,
      message: `${generatedSheets.length} پاسخ‌برگ با موفقیت آماده و ثبت شد`,
      data: {
        examId,
        classId: classroom._id,
        className: classroom.name,
        examTitle,
        subject: subject || classroom.name,
        examDate,
        totalQuestions,
        optionsPerQuestion,
        pointsPerQuestion,
        negativeMarking,
        negativeFactor,
        maxScore,
        templateId: templateId || 'MODEL_1',
        answerKey,
        sheets: generatedSheets,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در تولید پاسخ‌برگ‌های دانش‌آموزان:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در صدور پاسخ‌برگ‌ها', error: error.message });
  }
};

/**
 * دریافت لیست و وضعیت پاسخ‌برگ‌های یک آزمون
 */
export const getExamSheets = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const teacher = await TeacherProfile.findOne({ user: userId });
    if (!teacher) {
      res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
      return;
    }

    const { examId } = req.params;
    const { classId } = req.query;

    const query: any = { teacher: teacher._id };
    if (examId && examId !== 'all') {
      query.exam = examId;
    }
    if (classId) {
      query.classroom = classId;
    }

    const sheets = await ExamSheet.find(query).sort({ createdAt: -1 });

    const totalCount = sheets.length;
    const gradedCount = sheets.filter((s) => s.status === 'GRADED').length;
    const pendingCount = totalCount - gradedCount;

    const totalScores = sheets.filter((s) => s.status === 'GRADED').map((s) => s.finalScore || 0);
    const averageScore =
      totalScores.length > 0
        ? Number((totalScores.reduce((a, b) => a + b, 0) / totalScores.length).toFixed(2))
        : 0;

    res.status(200).json({
      success: true,
      data: {
        totalCount,
        gradedCount,
        pendingCount,
        averageScore,
        sheets,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت لیست پاسخ‌برگ‌ها:', error);
    res.status(500).json({ success: false, message: 'خطای سرور', error: error.message });
  }
};

/**
 * استعلام و شناسایی پاسخ‌برگ بر اساس کد برگه (QR یا ورود دستی کد توسط معلم)
 */
export const lookupSheetByCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const teacher = await TeacherProfile.findOne({ user: userId });
    if (!teacher) {
      res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
      return;
    }

    const code = req.query.code as string;
    if (!code || !code.trim()) {
      res.status(400).json({ success: false, message: 'کد برگه وارد نشده است' });
      return;
    }

    const cleanCode = code.trim().toUpperCase();

    // جستجوی برگه
    const sheet = await ExamSheet.findOne({
      sheetCode: cleanCode,
      teacher: teacher._id,
    }).populate('classroom', 'name');

    if (!sheet) {
      res.status(404).json({
        success: false,
        message: 'پاسخ‌برگی با این کد در لیست آزمون‌های شما یافت نشد. لطفاً کد را مجدداً بررسی فرمایید.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        sheetId: sheet._id,
        sheetCode: sheet.sheetCode,
        studentName: sheet.studentName,
        studentPhone: sheet.studentPhone,
        className: (sheet.classroom as any)?.name || 'کلاس',
        classId: sheet.classroom?._id || sheet.classroom,
        examId: sheet.exam,
        examTitle: sheet.examTitle,
        subject: sheet.subject,
        examDate: sheet.examDate,
        totalQuestions: sheet.totalQuestions,
        optionsPerQuestion: sheet.optionsPerQuestion,
        pointsPerQuestion: sheet.pointsPerQuestion,
        negativeMarking: sheet.negativeMarking,
        negativeFactor: sheet.negativeFactor,
        maxScore: sheet.maxScore,
        templateId: sheet.templateId || 'MODEL_1',
        optionLabelType: sheet.optionLabelType || 'ALPHABETIC',
        answerKey: sheet.answerKey,
        status: sheet.status,
        gradingMethod: sheet.gradingMethod,
        existingAnswers: sheet.recognizedAnswers || [],
        existingScore: sheet.finalScore,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در استعلام کد پاسخ‌برگ:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در استعلام برگه', error: error.message });
  }
};

/**
 * ثبت و محاسبه نهایی نمره پاسخ‌برگ (تصحیح هوشمند یا دستی)
 */
export const gradeExamSheet = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const teacher = await TeacherProfile.findOne({ user: userId });
    if (!teacher) {
      res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
      return;
    }

    const {
      sheetCode,
      answers = [], // [{ questionNumber, selectedOption, confidence, isAmbiguous, isMultiple, isBlank }]
      gradingMethod = 'AUTOMATIC',
      recordInGradebook = true,
      customScore, // در صورت ورود نمره دلخواه توسط معلم
    } = req.body;

    if (!sheetCode) {
      res.status(400).json({ success: false, message: 'کد برگه الزامی است' });
      return;
    }

    const sheet = await ExamSheet.findOne({
      sheetCode: sheetCode.trim().toUpperCase(),
      teacher: teacher._id,
    });

    if (!sheet) {
      res.status(404).json({ success: false, message: 'پاسخ‌برگ یافت نشد' });
      return;
    }

    const totalQuestions = sheet.totalQuestions;
    const answerKey = sheet.answerKey || [];
    const pointsPerQuestion = sheet.pointsPerQuestion || (sheet.maxScore / totalQuestions);
    const negativeMarking = sheet.negativeMarking;
    const negativeFactor = sheet.negativeFactor || 0.33;

    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    let ambiguousCount = 0;

    const evaluatedAnswers: IRecognizedAnswer[] = [];

    for (let q = 1; q <= totalQuestions; q++) {
      const studentAnsObj = answers.find((a: any) => a.questionNumber === q);
      const selectedOption = studentAnsObj ? studentAnsObj.selectedOption : 0;
      const isBlank = selectedOption === 0 || studentAnsObj?.isBlank === true;
      const isMultiple = selectedOption === -1 || studentAnsObj?.isMultiple === true;
      const isAmbiguous = studentAnsObj?.isAmbiguous === true;

      const correctOption = answerKey[q - 1]; // ۱ ایندکس
      let isCorrect = false;
      let earnedScore = 0;

      if (isBlank) {
        unansweredCount++;
        earnedScore = 0;
      } else if (isMultiple) {
        incorrectCount++;
        isCorrect = false;
        earnedScore = negativeMarking ? -(pointsPerQuestion * negativeFactor) : 0;
      } else if (correctOption && selectedOption === correctOption) {
        correctCount++;
        isCorrect = true;
        earnedScore = pointsPerQuestion;
      } else {
        incorrectCount++;
        isCorrect = false;
        earnedScore = negativeMarking ? -(pointsPerQuestion * negativeFactor) : 0;
      }

      if (isAmbiguous) {
        ambiguousCount++;
      }

      evaluatedAnswers.push({
        questionNumber: q,
        selectedOption,
        confidence: studentAnsObj?.confidence ?? 1.0,
        isAmbiguous,
        isMultiple,
        isBlank,
        isCorrect,
        earnedScore,
      });
    }

    let rawScore = evaluatedAnswers.reduce((sum, a) => sum + (a.earnedScore || 0), 0);
    // نرمال‌سازی با سقف maxScore و کف ۰
    let finalScore = customScore !== undefined ? Number(customScore) : Math.max(0, Math.min(sheet.maxScore, rawScore));
    finalScore = Number(finalScore.toFixed(2));

    sheet.recognizedAnswers = evaluatedAnswers;
    sheet.correctCount = correctCount;
    sheet.incorrectCount = incorrectCount;
    sheet.unansweredCount = unansweredCount;
    sheet.ambiguousCount = ambiguousCount;
    sheet.rawScore = Number(rawScore.toFixed(2));
    sheet.finalScore = finalScore;
    sheet.status = 'GRADED';
    sheet.gradingMethod = gradingMethod;
    sheet.gradedAt = new Date();

    // ایجاد یا به‌روزرسانی ExamSession در صورت وجود Exam
    if (sheet.exam) {
      let session = await ExamSession.findOne({
        exam: sheet.exam,
        participantIdentifier: sheet.studentPhone,
      });

      if (!session) {
        session = new ExamSession({
          exam: sheet.exam,
          participantIdentifier: sheet.studentPhone,
          firstNameSnapshot: sheet.studentName.split(' ')[0] || sheet.studentName,
          lastNameSnapshot: sheet.studentName.split(' ').slice(1).join(' ') || '',
          matchingStatus: 'MATCHED',
          status: 'finished',
          finishTime: new Date(),
          totalEarnedScore: finalScore,
          gradingStatus: 'graded',
        });
      } else {
        session.status = 'finished';
        session.finishTime = new Date();
        session.totalEarnedScore = finalScore;
        session.gradingStatus = 'graded';
      }
      await session.save();
      sheet.examSession = session._id as any;
    }

    // در صورت فعال بودن ثبت در کارنامه، ایجاد یا به‌روزرسانی GradebookRecord
    if (recordInGradebook) {
      const todayDate = new Date().toISOString().split('T')[0];
      const gradeTitle = `آزمون تستی: ${sheet.examTitle} (نمره: ${finalScore} از ${sheet.maxScore})`;
      const gradeColor = finalScore >= (sheet.maxScore * 0.75) ? 'good' : finalScore >= (sheet.maxScore * 0.5) ? 'warning' : 'danger';

      let gradebookRecord = await GradebookRecord.findOne({
        classroom: sheet.classroom,
        student: sheet.studentPhone,
        title: { $regex: new RegExp(`^آزمون تستی: ${sheet.examTitle}`) },
      });

      if (gradebookRecord) {
        gradebookRecord.title = gradeTitle;
        gradebookRecord.color = gradeColor;
        gradebookRecord.date = todayDate;
        await gradebookRecord.save();
      } else {
        gradebookRecord = new GradebookRecord({
          teacher: teacher.user,
          classroom: sheet.classroom,
          student: sheet.studentPhone,
          date: todayDate,
          type: 'exam',
          color: gradeColor,
          title: gradeTitle,
        });
        await gradebookRecord.save();
      }
      sheet.gradebookRecord = gradebookRecord._id as any;
    }

    await sheet.save();

    res.status(200).json({
      success: true,
      message: `نمره برگه دانش‌آموز ${sheet.studentName} با موفقیت محاسبه و ثبت شد (${finalScore} از ${sheet.maxScore})`,
      data: {
        sheetCode: sheet.sheetCode,
        studentName: sheet.studentName,
        studentPhone: sheet.studentPhone,
        examTitle: sheet.examTitle,
        totalQuestions: sheet.totalQuestions,
        correctCount,
        incorrectCount,
        unansweredCount,
        ambiguousCount,
        rawScore: sheet.rawScore,
        finalScore: sheet.finalScore,
        maxScore: sheet.maxScore,
        gradingMethod: sheet.gradingMethod,
        answers: evaluatedAnswers,
        gradedAt: sheet.gradedAt,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در تصحیح و ثبت نمره پاسخ‌برگ:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ثبت نمره', error: error.message });
  }
};
