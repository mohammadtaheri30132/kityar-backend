import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { Form, IForm } from '../../../core/models/Form.js';
import { FormResponse } from '../../../core/models/FormResponse.js';
import { TeacherProfile } from '../../../core/models/TeacherProfile.js';
import { FORM_TEMPLATES } from '../../../utils/formTemplates.js';
import { logger } from '../../../core/utils/logger.js';

// Helper to resolve teacher profile from authenticated user
const getTeacherProfile = async (req: Request) => {
  const userId = (req as any).user?._id || (req as any).user?.id;
  if (!userId) return null;
  let teacher = await TeacherProfile.findOne({ user: userId });
  if (!teacher) {
    teacher = await TeacherProfile.create({
      user: userId,
      category: 'آموزگار',
      position: 'معلم',
    });
  }
  return teacher;
};

// Generate unique non-guessable slug
const generateUniqueSlug = async (): Promise<string> => {
  let slug = '';
  let exists = true;
  while (exists) {
    slug = crypto.randomBytes(5).toString('hex'); // 10 chars, e.g. 'a8f3b9c1d2'
    const found = await Form.findOne({ publicSlug: slug });
    if (!found) exists = false;
  }
  return slug;
};

// GET /api/teacher/forms
export const getTeacherForms = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' });
      return;
    }

    const { status, formType, search, sort = 'newest' } = req.query;

    const query: any = { teacher: teacher._id };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (formType && formType !== 'all') {
      query.formType = formType;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      query.$or = [
        { title: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
        { category: { $regex: term, $options: 'i' } },
      ];
    }

    let sortOptions: any = { createdAt: -1 };
    if (sort === 'oldest') sortOptions = { createdAt: 1 };
    else if (sort === 'updated') sortOptions = { updatedAt: -1 };
    else if (sort === 'responses') sortOptions = { responseCount: -1 };

    const forms = await Form.find(query).sort(sortOptions);

    res.json({
      success: true,
      data: forms,
      count: forms.length,
    });
  } catch (error: any) {
    logger.error('Error fetching teacher forms:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت لیست فرم‌ها', error: error?.message });
  }
};

// GET /api/teacher/forms/templates
export const getFormTemplates = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({
      success: true,
      data: FORM_TEMPLATES,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در دریافت قالب‌ها' });
  }
};

// POST /api/teacher/forms
export const createForm = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' });
      return;
    }

    const { templateId, title, description, category, formType, status, theme, settings, sections, questions, logicRules } = req.body;

    const publicSlug = await generateUniqueSlug();

    let newFormData: Partial<IForm> = {
      teacher: teacher._id,
      title: title || 'فرم جدید',
      description: description || '',
      category: category || 'عمومی',
      formType: formType || 'survey',
      status: (status === 'published' || status === 'scheduled' || status === 'closed') ? status : (status === 'draft' ? 'draft' : 'published'),
      publishedAt: status === 'published' ? new Date() : undefined,
      publicSlug,
      theme: {
        primaryColor: theme?.primaryColor || '#3B82F6',
        backgroundColor: theme?.backgroundColor || '#F8FAFC',
        mode: theme?.mode || 'conversational',
        welcomeTitle: theme?.welcomeTitle || '',
        welcomeDescription: theme?.welcomeDescription || '',
        completionTitle: theme?.completionTitle || 'با تشکر از شما',
        completionMessage: theme?.completionMessage || 'پاسخ شما با موفقیت ثبت شد.',
        showProgressBar: theme?.showProgressBar ?? true,
      },
      settings: {
        accessType: settings?.accessType || 'public',
        classId: settings?.classId,
        limitOnePerDevice: settings?.limitOnePerDevice ?? true,
        limitOnePerAccount: settings?.limitOnePerAccount ?? false,
        maxResponses: settings?.maxResponses,
        password: settings?.password,
        startDate: settings?.startDate,
        endDate: settings?.endDate,
        isQuiz: settings?.isQuiz ?? false,
        passingScore: settings?.passingScore,
        showScoreToRespondent: settings?.showScoreToRespondent ?? true,
        showCorrectAnswers: settings?.showCorrectAnswers || 'after_submission',
        allowPartialSave: settings?.allowPartialSave ?? true,
        allowMultipleSubmissions: settings?.allowMultipleSubmissions ?? false,
      },
      sections: sections || [],
      questions: questions || [],
      logicRules: logicRules || [],
    };

    // If templateId provided, merge template data
    if (templateId) {
      const template = FORM_TEMPLATES.find((t) => t.id === templateId);
      if (template) {
        newFormData = {
          ...newFormData,
          title: title || template.title,
          description: description || template.description,
          category: template.category,
          formType: template.formType,
          theme: { ...newFormData.theme!, ...template.theme },
          settings: { ...newFormData.settings!, ...template.settings },
          questions: template.questions.map((q, idx) => ({
            ...q,
            id: `q_${Date.now()}_${idx}`,
          })),
        };
      }
    }

    // Ensure questions have IDs
    if (newFormData.questions) {
      newFormData.questions = newFormData.questions.map((q: any, i: number) => ({
        ...q,
        id: q.id || `q_${Date.now()}_${i}`,
        order: q.order ?? i + 1,
      }));
    }

    const form = await Form.create(newFormData);

    res.status(201).json({
      success: true,
      message: 'فرم با موفقیت ایجاد شد',
      data: form,
    });
  } catch (error: any) {
    logger.error('Error creating form:', error);
    res.status(500).json({ success: false, message: 'خطا در ایجاد فرم', error: error?.message });
  }
};

// GET /api/teacher/forms/:id
export const getFormById = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'احراز هویت نشده' });
      return;
    }

    const form = await Form.findOne({ _id: req.params.id, teacher: teacher._id });
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    res.json({ success: true, data: form });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات فرم' });
  }
};

// PUT /api/teacher/forms/:id
export const updateForm = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'احراز هویت نشده' });
      return;
    }

    const form = await Form.findOne({ _id: req.params.id, teacher: teacher._id });
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    const {
      title,
      description,
      category,
      formType,
      status,
      coverImage,
      theme,
      settings,
      sections,
      questions,
      logicRules,
    } = req.body;

    if (title !== undefined) form.title = title;
    if (description !== undefined) form.description = description;
    if (category !== undefined) form.category = category;
    if (formType !== undefined) form.formType = formType;
    if (status !== undefined) {
      form.status = status;
      if (status === 'published' && !form.publishedAt) form.publishedAt = new Date();
    }
    if (coverImage !== undefined) form.coverImage = coverImage;
    if (theme !== undefined) form.theme = { ...form.theme, ...theme };
    if (settings !== undefined) form.settings = { ...form.settings, ...settings };
    if (sections !== undefined) form.sections = sections;
    if (questions !== undefined) {
      // Ensure IDs and orders are well-formed
      form.questions = questions.map((q: any, i: number) => ({
        ...q,
        id: q.id || `q_${Date.now()}_${i}`,
        order: q.order ?? i + 1,
      }));
    }
    if (logicRules !== undefined) form.logicRules = logicRules;

    await form.save();

    res.json({
      success: true,
      message: 'تغییرات فرم با موفقیت ذخیره شد',
      data: form,
    });
  } catch (error: any) {
    logger.error('Error updating form:', error);
    res.status(500).json({ success: false, message: 'خطا در ذخیره تغییرات فرم', error: error?.message });
  }
};

// POST /api/teacher/forms/:id/duplicate
export const duplicateForm = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'احراز هویت نشده' });
      return;
    }

    const original = await Form.findOne({ _id: req.params.id, teacher: teacher._id });
    if (!original) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    const newSlug = await generateUniqueSlug();
    const cloned = original.toObject();
    delete (cloned as any)._id;
    delete (cloned as any).createdAt;
    delete (cloned as any).updatedAt;

    cloned.title = `${cloned.title} (کپی)`;
    cloned.publicSlug = newSlug;
    cloned.status = 'draft';
    cloned.responseCount = 0;
    cloned.lastSubmittedAt = undefined;

    const duplicatedForm = await Form.create(cloned);

    res.status(201).json({
      success: true,
      message: 'فرم با موفقیت کپی شد',
      data: duplicatedForm,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در کپی فرم' });
  }
};

// POST /api/teacher/forms/:id/status
export const updateFormStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'احراز هویت نشده' });
      return;
    }

    const { status } = req.body;
    if (!['draft', 'published', 'closed', 'archived'].includes(status)) {
      res.status(400).json({ success: false, message: 'وضعیت نامعتبر است' });
      return;
    }

    const form = await Form.findOne({ _id: req.params.id, teacher: teacher._id });
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    form.status = status;
    await form.save();

    res.json({
      success: true,
      message: `وضعیت فرم به ${status === 'published' ? 'منتشر شده' : status === 'closed' ? 'بسته شده' : 'پیش‌نویس'} تغییر یافت`,
      data: form,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت فرم' });
  }
};

// DELETE /api/teacher/forms/:id
export const deleteForm = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'احراز هویت نشده' });
      return;
    }

    const form = await Form.findOneAndDelete({ _id: req.params.id, teacher: teacher._id });
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    // Delete associated responses
    await FormResponse.deleteMany({ form: form._id });

    res.json({
      success: true,
      message: 'فرم و پاسخ‌های آن با موفقیت حذف شدند',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در حذف فرم' });
  }
};

// GET /api/teacher/forms/:id/responses
export const getFormResponses = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'احراز هویت نشده' });
      return;
    }

    const form = await Form.findOne({ _id: req.params.id, teacher: teacher._id });
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    const { status, search, page = 1, limit = 50 } = req.query;
    const query: any = { form: form._id };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      query.$or = [
        { respondentName: { $regex: term, $options: 'i' } },
        { respondentPhone: { $regex: term, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.max(1, Math.min(200, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [responses, total] = await Promise.all([
      FormResponse.find(query).sort({ submittedAt: -1 }).skip(skip).limit(limitNum),
      FormResponse.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: responses,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در دریافت پاسخ‌ها' });
  }
};

// GET /api/teacher/forms/:id/responses/:responseId
export const getFormResponseById = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'احراز هویت نشده' });
      return;
    }

    const form = await Form.findOne({ _id: req.params.id, teacher: teacher._id });
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    const response = await FormResponse.findOne({ _id: req.params.responseId, form: form._id });
    if (!response) {
      res.status(404).json({ success: false, message: 'پاسخ یافت نشد' });
      return;
    }

    res.json({
      success: true,
      data: response,
      formQuestions: form.questions,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در دریافت پاسخ' });
  }
};

// PUT /api/teacher/forms/:id/responses/:responseId/grade
export const gradeFormResponse = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'احراز هویت نشده' });
      return;
    }

    const form = await Form.findOne({ _id: req.params.id, teacher: teacher._id });
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    const response = await FormResponse.findOne({ _id: req.params.responseId, form: form._id });
    if (!response) {
      res.status(404).json({ success: false, message: 'پاسخ یافت نشد' });
      return;
    }

    const { grades, teacherNotes } = req.body; // grades: [{ questionId, pointsEarned, feedback }]

    if (Array.isArray(grades)) {
      grades.forEach((g: any) => {
        const answer = response.answers.find((a) => a.questionId === g.questionId);
        if (answer) {
          if (typeof g.pointsEarned === 'number') answer.pointsEarned = g.pointsEarned;
          if (g.feedback !== undefined) answer.feedback = g.feedback;
          answer.isManuallyGraded = true;
        }
      });

      // Recalculate total score
      const total = response.answers.reduce((acc, curr) => acc + (curr.pointsEarned || 0), 0);
      response.totalScore = total;
      if (form.settings.passingScore) {
        response.isPassed = total >= form.settings.passingScore;
      }
    }

    if (teacherNotes !== undefined) {
      response.teacherNotes = teacherNotes;
    }

    await response.save();

    res.json({
      success: true,
      message: 'نمرات و بازخورد با موفقیت ثبت شد',
      data: response,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در ثبت نمره' });
  }
};

// GET /api/teacher/forms/:id/analytics
export const getFormAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'احراز هویت نشده' });
      return;
    }

    const form = await Form.findOne({ _id: req.params.id, teacher: teacher._id });
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    const responses = await FormResponse.find({ form: form._id });

    const totalSubmissions = responses.length;
    const completedCount = responses.filter((r) => r.status === 'completed').length;
    const completionRate = totalSubmissions > 0 ? Math.round((completedCount / totalSubmissions) * 100) : 0;

    const avgDuration =
      totalSubmissions > 0
        ? Math.round(responses.reduce((sum, r) => sum + (r.durationSeconds || 0), 0) / totalSubmissions)
        : 0;

    let averageQuizScore = 0;
    if (form.settings.isQuiz && totalSubmissions > 0) {
      averageQuizScore = Math.round(
        (responses.reduce((sum, r) => sum + (r.totalScore || 0), 0) / totalSubmissions) * 10
      ) / 10;
    }

    // Question-by-question breakdown
    const questionAnalytics = form.questions.map((q) => {
      const qAnswers = responses
        .map((r) => r.answers.find((a) => a.questionId === q.id))
        .filter(Boolean);

      const answeredCount = qAnswers.length;
      const skippedCount = totalSubmissions - answeredCount;

      let optionBreakdown: { [key: string]: { label: string; count: number; percentage: number } } = {};
      let numericStats = { min: 0, max: 0, avg: 0 };
      let textSamples: string[] = [];
      let quizCorrectCount = 0;

      // Choice, Rating, Quiz distributions
      if (['single_choice', 'multiple_choice', 'dropdown', 'yes_no', 'true_false', 'likert', 'quiz_single', 'quiz_multiple'].includes(q.type)) {
        if (q.options && q.options.length > 0) {
          q.options.forEach((opt) => {
            optionBreakdown[opt.id] = { label: opt.label, count: 0, percentage: 0 };
          });
        }

        qAnswers.forEach((ans: any) => {
          const val = ans.value;
          if (Array.isArray(val)) {
            val.forEach((optId) => {
              if (optionBreakdown[optId]) optionBreakdown[optId].count += 1;
            });
          } else if (val && optionBreakdown[val]) {
            optionBreakdown[val].count += 1;
          }

          if (q.type.startsWith('quiz_') && (ans.pointsEarned || 0) > 0) {
            quizCorrectCount += 1;
          }
        });

        // Compute percentages
        Object.keys(optionBreakdown).forEach((optId) => {
          const count = optionBreakdown[optId].count;
          optionBreakdown[optId].percentage = answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0;
        });
      }

      // Ratings & Numbers
      if (['number', 'rating_stars', 'rating_number'].includes(q.type)) {
        const numbers = qAnswers
          .map((a: any) => Number(a.numberValue ?? a.value))
          .filter((n) => !isNaN(n));
        if (numbers.length > 0) {
          numericStats.min = Math.min(...numbers);
          numericStats.max = Math.max(...numbers);
          numericStats.avg = Math.round((numbers.reduce((s, n) => s + n, 0) / numbers.length) * 10) / 10;
        }
      }

      // Short / Long text samples
      if (['short_text', 'long_text', 'email', 'phone', 'url', 'quiz_short_answer'].includes(q.type)) {
        textSamples = qAnswers
          .map((a: any) => a.textValue || a.value)
          .filter((v: any) => typeof v === 'string' && v.trim().length > 0)
          .slice(0, 15);
      }

      return {
        questionId: q.id,
        title: q.title,
        type: q.type,
        answeredCount,
        skippedCount,
        optionBreakdown: Object.values(optionBreakdown),
        numericStats,
        textSamples,
        quizCorrectRate: answeredCount > 0 ? Math.round((quizCorrectCount / answeredCount) * 100) : 0,
      };
    });

    res.json({
      success: true,
      data: {
        totalSubmissions,
        completedCount,
        completionRate,
        avgDurationSeconds: avgDuration,
        averageQuizScore,
        questionAnalytics,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching analytics:', error);
    res.status(500).json({ success: false, message: 'خطا در تحلیل داده‌های فرم' });
  }
};

// GET /api/teacher/forms/:id/export/csv
export const exportFormResponsesCsv = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'احراز هویت نشده' });
      return;
    }

    const form = await Form.findOne({ _id: req.params.id, teacher: teacher._id });
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    const responses = await FormResponse.find({ form: form._id }).sort({ submittedAt: -1 });

    // Headers
    const headers = [
      'ردیف',
      'نام پاسخ‌دهنده',
      'شماره تماس',
      'تاریخ و ساعت ثبت',
      'مدت زمان (ثانیه)',
      'وضعیت',
    ];

    if (form.settings.isQuiz) {
      headers.push('نمره کل', 'نمره قبولی');
    }

    // Add question columns
    form.questions.forEach((q, i) => {
      headers.push(`سوال ${i + 1}: ${q.title.replace(/"/g, '""')}`);
    });

    // Rows
    const rows: string[] = [];
    responses.forEach((resp, idx) => {
      const row: string[] = [
        (idx + 1).toString(),
        resp.respondentName || 'ناشناس',
        resp.respondentPhone || '-',
        resp.submittedAt ? new Date(resp.submittedAt).toLocaleString('fa-IR') : '-',
        (resp.durationSeconds || 0).toString(),
        resp.status === 'completed' ? 'تکمیل شده' : 'ناتمام',
      ];

      if (form.settings.isQuiz) {
        row.push((resp.totalScore || 0).toString(), (form.settings.passingScore || 0).toString());
      }

      form.questions.forEach((q) => {
        const answer = resp.answers.find((a) => a.questionId === q.id);
        if (!answer || answer.value === undefined || answer.value === null) {
          row.push('-');
        } else if (Array.isArray(answer.selectedOptionLabels) && answer.selectedOptionLabels.length > 0) {
          row.push(answer.selectedOptionLabels.join(' | '));
        } else if (answer.files && answer.files.length > 0) {
          row.push(answer.files.map((f) => f.url).join(' | '));
        } else if (answer.audioRecordingUrl) {
          row.push(answer.audioRecordingUrl);
        } else {
          row.push(String(answer.value));
        }
      });

      // Escape CSV values
      const escapedRow = row.map((val) => `"${String(val).replace(/"/g, '""')}"`);
      rows.push(escapedRow.join(','));
    });

    const csvContent = '\uFEFF' + headers.map((h) => `"${h}"`).join(',') + '\n' + rows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="form_${form.publicSlug}_responses.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    logger.error('Error exporting CSV:', error);
    res.status(500).json({ success: false, message: 'خطا در خروجی CSV' });
  }
};

// GET /api/teacher/forms/:id/export/json
export const exportFormResponsesJson = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await getTeacherProfile(req);
    if (!teacher) {
      res.status(401).json({ success: false, message: 'احراز هویت نشده' });
      return;
    }

    const form = await Form.findOne({ _id: req.params.id, teacher: teacher._id });
    if (!form) {
      res.status(404).json({ success: false, message: 'فرم یافت نشد' });
      return;
    }

    const responses = await FormResponse.find({ form: form._id }).sort({ submittedAt: -1 });

    res.setHeader('Content-Disposition', `attachment; filename="form_${form.publicSlug}_responses.json"`);
    res.json({
      success: true,
      formTitle: form.title,
      publicSlug: form.publicSlug,
      totalResponses: responses.length,
      exportedAt: new Date().toISOString(),
      questions: form.questions,
      responses,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در خروجی JSON' });
  }
};

// POST /api/teacher/forms/upload-media
export const uploadFormMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'هیچ فایلی ارسال نشده است' });
      return;
    }

    const relativeUrl = `/uploads/${file.filename}`;
    res.json({
      success: true,
      message: 'فایل با موفقیت بارگذاری شد',
      url: relativeUrl,
      filename: file.filename,
      sizeBytes: file.size,
      mimeType: file.mimetype,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در بارگذاری فایل' });
  }
};
