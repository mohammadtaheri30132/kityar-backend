import { Request, Response } from 'express';
import { Form, IForm } from '../../../core/models/Form.js';
import { FormResponse, IResponseAnswer } from '../../../core/models/FormResponse.js';
import { logger } from '../../../core/utils/logger.js';

// Find form by slug or ID
const findActiveForm = async (slugOrId: string): Promise<IForm | null> => {
  let form = await Form.findOne({ publicSlug: slugOrId });
  if (!form && slugOrId.match(/^[0-9a-fA-F]{24}$/)) {
    form = await Form.findById(slugOrId);
  }
  return form;
};

// GET /api/public/forms/:slugOrId
export const getPublicForm = async (req: Request, res: Response): Promise<void> => {
  try {
    const slugOrId = String(req.params.slugOrId);
    const form = await findActiveForm(slugOrId);

    if (!form) {
      res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'فرم مورد نظر یافت نشد یا ممکن است حذف شده باشد.',
      });
      return;
    }

    const now = new Date();

    // Check status
    if (form.status === 'draft') {
      res.status(403).json({
        success: false,
        code: 'DRAFT',
        message: 'این فرم در وضعیت پیش‌نویس است و هنوز منتشر نشده است.',
        title: form.title,
      });
      return;
    }

    if (form.status === 'closed' || form.status === 'archived') {
      res.status(403).json({
        success: false,
        code: 'CLOSED',
        message: 'مهلت پاسخگویی به این فرم به پایان رسیده است.',
        title: form.title,
      });
      return;
    }

    // Check schedule
    if (form.settings.startDate && new Date(form.settings.startDate) > now) {
      res.status(403).json({
        success: false,
        code: 'NOT_STARTED',
        message: 'زمان شروع پاسخگویی به این فرم هنوز فرا نرسیده است.',
        startDate: form.settings.startDate,
        title: form.title,
      });
      return;
    }

    if (form.settings.endDate && new Date(form.settings.endDate) < now) {
      res.status(403).json({
        success: false,
        code: 'EXPIRED',
        message: 'مهلت پاسخگویی به این فرم به پایان رسیده است.',
        title: form.title,
      });
      return;
    }

    // Check max responses
    if (form.settings.maxResponses && form.responseCount >= form.settings.maxResponses) {
      res.status(403).json({
        success: false,
        code: 'MAX_REACHED',
        message: 'ظرفیت ثبت پاسخ برای این فرم تکمیل شده است.',
        title: form.title,
      });
      return;
    }

    // Sanitize questions: NEVER leak correct answers or private answer explanations to respondent!
    const sanitizedQuestions = form.questions.map((q) => {
      const qObj: any = {
        id: q.id,
        sectionId: q.sectionId,
        type: q.type,
        title: q.title,
        description: q.description,
        required: q.required,
        order: q.order,
        allowOther: q.allowOther,
        minSelections: q.minSelections,
        maxSelections: q.maxSelections,
        minValue: q.minValue,
        maxValue: q.maxValue,
        step: q.step,
        minLength: q.minLength,
        maxLength: q.maxLength,
        allowedMediaTypes: q.allowedMediaTypes,
        maxFileSizeMb: q.maxFileSizeMb,
        maxFilesCount: q.maxFilesCount,
        promptImageUrl: q.promptImageUrl,
        promptAudioUrl: q.promptAudioUrl,
        allowImageAttachment: q.allowImageAttachment,
        allowAudioAttachment: q.allowAudioAttachment,
        points: q.points,
      };

      if (q.options) {
        qObj.options = q.options.map((opt) => ({
          id: opt.id,
          label: opt.label,
          nextQuestionId: opt.nextQuestionId,
        }));
      }

      return qObj;
    });

    res.json({
      success: true,
      data: {
        id: form._id,
        title: form.title,
        description: form.description,
        category: form.category,
        formType: form.formType,
        coverImage: form.coverImage,
        publicSlug: form.publicSlug,
        theme: form.theme,
        settings: {
          isQuiz: form.settings.isQuiz,
          showScoreToRespondent: form.settings.showScoreToRespondent,
          hasPassword: Boolean(form.settings.password),
          allowPartialSave: form.settings.allowPartialSave,
          limitOnePerDevice: form.settings.limitOnePerDevice,
          accessType: form.settings.accessType,
        },
        sections: form.sections,
        questions: sanitizedQuestions,
        logicRules: form.logicRules,
      },
    });
  } catch (error: any) {
    logger.error('Error in getPublicForm:', error);
    res.status(500).json({ success: false, message: 'خطا در بارگذاری فرم' });
  }
};

// POST /api/public/forms/:slugOrId/verify-device
export const verifyDeviceSubmission = async (req: Request, res: Response): Promise<void> => {
  try {
    const slugOrId = String(req.params.slugOrId);
    const { deviceFingerprint, respondentPhone } = req.body;

    const form = await findActiveForm(slugOrId);
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    if (!form.settings.limitOnePerDevice && !form.settings.limitOnePerAccount) {
      res.json({ success: true, canSubmit: true });
      return;
    }

    // Check cookie
    const cookieForm = (req as any).cookies?.[`kitayar_sub_${form._id}`] || (req as any).cookies?.[`kitayar_sub_${form.publicSlug}`];
    if (cookieForm) {
      res.json({
        success: true,
        canSubmit: false,
        message: 'شما قبلاً با این مرورگر در این فرم شرکت کرده‌اید. ثبت مجدد مجاز نمی‌باشد.',
      });
      return;
    }

    const orConditions: any[] = [];

    if (form.settings.limitOnePerDevice && deviceFingerprint) {
      orConditions.push({ deviceFingerprint });
    }

    if (respondentPhone) {
      orConditions.push({ respondentPhone });
    }

    if (orConditions.length > 0) {
      const existing = await FormResponse.findOne({
        form: form._id,
        status: 'completed',
        $or: orConditions,
      });
      if (existing) {
        res.json({
          success: true,
          canSubmit: false,
          message: 'شما قبلاً در این فرم شرکت کرده‌اید. ثبت مجدد مجاز نمی‌باشد.',
        });
        return;
      }
    }

    res.json({ success: true, canSubmit: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در بررسی دستگاه' });
  }
};

// POST /api/public/forms/:slugOrId/upload-file
export const uploadRespondentFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'فایلی ارسال نشده است' });
      return;
    }

    const relativeUrl = `/uploads/${file.filename}`;
    res.json({
      success: true,
      data: {
        filename: file.filename,
        originalName: file.originalname,
        url: relativeUrl,
        sizeBytes: file.size,
        mimeType: file.mimetype,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در بارگذاری فایل' });
  }
};

// POST /api/public/forms/:slugOrId/submit
export const submitPublicForm = async (req: Request, res: Response): Promise<void> => {
  try {
    const slugOrId = String(req.params.slugOrId);
    const {
      answers,
      respondentName,
      respondentPhone,
      deviceFingerprint,
      durationSeconds = 0,
      password,
    } = req.body;

    const form = await findActiveForm(slugOrId);
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    if (form.status !== 'published') {
      res.status(403).json({ success: false, message: 'این فرم در حال حاضر پذیرای پاسخ جدید نیست.' });
      return;
    }

    // Verify access password if set
    if (form.settings.password && form.settings.password.trim()) {
      if (form.settings.password.trim() !== (password || '').trim()) {
        res.status(401).json({ success: false, message: 'رمز عبور ورود به فرم نادرست است.' });
        return;
      }
    }

    // Check device duplicate constraint
    if (form.settings.limitOnePerDevice && deviceFingerprint) {
      const existing = await FormResponse.findOne({
        form: form._id,
        deviceFingerprint,
        status: 'completed',
      });
      if (existing) {
        res.status(409).json({
          success: false,
          code: 'DUPLICATE_SUBMISSION',
          message: 'یک پاسخ قبلاً از طریق این دستگاه برای این فرم ثبت شده است.',
        });
        return;
      }
    }

    // Process & Grade Answers
    let totalScore = 0;
    let maxPossibleScore = 0;
    const processedAnswers: IResponseAnswer[] = [];

    const answersMap = new Map<string, any>();
    if (Array.isArray(answers)) {
      answers.forEach((ans) => {
        answersMap.set(ans.questionId, ans);
      });
    }

    for (const q of form.questions) {
      const submitted = answersMap.get(q.id);
      const val = submitted?.value;

      // Validate required
      if (q.required) {
        const isEmpty =
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0) ||
          (q.type === 'file_upload' && (!submitted?.files || submitted.files.length === 0)) ||
          (q.type === 'image_upload' && (!submitted?.files || submitted.files.length === 0)) ||
          (q.type === 'audio_record' && !submitted?.audioRecordingUrl && (!submitted?.files || submitted.files.length === 0));

        if (isEmpty) {
          res.status(400).json({
            success: false,
            message: `پاسخ به سوال «${q.title}» الزامی است.`,
            questionId: q.id,
          });
          return;
        }
      }

      let pointsEarned = 0;
      const maxPoints = q.points || 0;
      maxPossibleScore += maxPoints;

      // Automatic quiz grading
      if (form.settings.isQuiz && maxPoints > 0) {
        if (q.type === 'quiz_single' || q.type === 'true_false' || q.type === 'single_choice') {
          const correctOpt = q.options?.find((o) => o.isCorrect);
          if (correctOpt && String(val) === String(correctOpt.id)) {
            pointsEarned = maxPoints;
          }
        } else if (q.type === 'quiz_multiple' || q.type === 'multiple_choice') {
          const correctOptIds = (q.options?.filter((o) => o.isCorrect) || []).map((o) => o.id);
          const submittedIds = Array.isArray(val) ? val.map(String) : [];
          const isAllCorrect =
            correctOptIds.length > 0 &&
            correctOptIds.length === submittedIds.length &&
            correctOptIds.every((id) => submittedIds.includes(id));
          if (isAllCorrect) {
            pointsEarned = maxPoints;
          }
        } else if (q.type === 'quiz_short_answer' && q.correctAnswerText) {
          const cleanUser = String(val || '').trim().toLowerCase();
          const cleanKey = q.correctAnswerText.trim().toLowerCase();
          if (cleanUser === cleanKey) {
            pointsEarned = maxPoints;
          }
        }
        totalScore += pointsEarned;
      }

      // Map selected option labels
      let selectedOptionLabels: string[] = [];
      if (q.options && val) {
        if (Array.isArray(val)) {
          selectedOptionLabels = q.options
            .filter((opt) => val.includes(opt.id))
            .map((opt) => opt.label);
        } else {
          const opt = q.options.find((o) => o.id === val);
          if (opt) selectedOptionLabels = [opt.label];
        }
      }

      processedAnswers.push({
        questionId: q.id,
        questionTitle: q.title,
        questionType: q.type,
        value: val,
        selectedOptionLabels,
        textValue: typeof val === 'string' ? val : submitted?.textValue,
        numberValue: typeof val === 'number' ? val : submitted?.numberValue,
        files: submitted?.files || [],
        audioRecordingUrl: submitted?.audioRecordingUrl,
        pointsEarned,
        maxPoints,
        isAutoGraded: form.settings.isQuiz && maxPoints > 0,
      });
    }

    const isPassed = form.settings.passingScore ? totalScore >= form.settings.passingScore : true;

    // Create response
    const newResponse = await FormResponse.create({
      form: form._id,
      respondentName: respondentName || '',
      respondentPhone: respondentPhone || '',
      deviceFingerprint: deviceFingerprint || '',
      ipAddress: req.ip,
      status: 'completed',
      submittedAt: new Date(),
      durationSeconds: Number(durationSeconds) || 0,
      totalScore,
      maxPossibleScore,
      isPassed,
      answers: processedAnswers,
    });

    // Atomically increment form response count
    await Form.findByIdAndUpdate(form._id, {
      $inc: { responseCount: 1 },
      $set: { lastSubmittedAt: new Date() },
    });

    if (form.settings.limitOnePerDevice) {
      res.cookie(`kitayar_sub_${form._id}`, '1', { maxAge: 365 * 24 * 3600 * 1000, path: '/' });
      res.cookie(`kitayar_sub_${form.publicSlug}`, '1', { maxAge: 365 * 24 * 3600 * 1000, path: '/' });
    }

    res.status(201).json({
      success: true,
      message: form.theme?.completionMessage || 'پاسخ شما با موفقیت ثبت شد.',
      data: {
        responseId: newResponse._id,
        completionTitle: form.theme?.completionTitle || 'با تشکر از مشارکت شما',
        completionMessage: form.theme?.completionMessage || 'پاسخ شما با موفقیت ثبت شد.',
        isQuiz: form.settings.isQuiz,
        showScoreToRespondent: form.settings.showScoreToRespondent,
        totalScore: form.settings.showScoreToRespondent ? totalScore : undefined,
        maxPossibleScore: form.settings.showScoreToRespondent ? maxPossibleScore : undefined,
        isPassed: form.settings.showScoreToRespondent ? isPassed : undefined,
      },
    });
  } catch (error: any) {
    logger.error('Error submitting public form:', error);
    res.status(500).json({ success: false, message: 'خطا در ثبت پاسخ', error: error?.message });
  }
};
