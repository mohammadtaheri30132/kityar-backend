import { Request, Response } from 'express'
import { Question } from '../../../core/models/Question.js'
import { logger } from '../../../core/utils/logger.js'

export const getQuestionsForExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { courseId, gradeId, bookId, lessonId, type, difficulty } = req.query

    if (!courseId || !gradeId || !bookId) {
      res.status(400).json({ success: false, message: 'انتخاب دوره، پایه و درس الزامی است' })
      return
    }

    // ساخت فیلتر پویا بر اساس ورودی‌های معلم
    const filter: any = {
      course: courseId,
      grade: gradeId,
      book: bookId,
      isActive: true, // فقط سوالات فعال ادمین
      status: 'تایید-شده' // فقط سوالات تایید شده نمایش داده شوند
    }

    if (lessonId) filter.lesson_id = Number(lessonId)
    if (type) filter.type = type
    if (difficulty) filter.difficulty = difficulty

    const questions = await Question.find(filter)
      .select('question_id type difficulty question options answer has_image source_image audioUrl has_audio tags lesson_id') // فقط فیلدهای مورد نیاز اپلیکیشن ارسال شود
      .sort({ createdAt: -1 })

    res.status(200).json({
      success: true,
      count: questions.length,
      data: questions,
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت لیست سوالات:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت سوالات' })
  }
}

export const getQuestionsBank = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const origin = req.query.origin as string || 'mine';
    const type = req.query.type as string;
    const difficulty = req.query.difficulty as string;
    const search = req.query.search as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (origin === 'mine') {
      query.createdBy = userId;
    } else if (origin === 'admin') {
      query.createdBy = { $ne: userId };
    }

    if (type && type !== 'all') {
      if (type === 'تشریحی') {
        query.type = { $in: ['تشریحی', 'گسترده-پاسخ', 'کوتاه-پاسخ'] };
      } else {
        query.type = type;
      }
    }

    if (difficulty && difficulty !== 'all') {
      query.difficulty = difficulty;
    }

    if (search && search.trim()) {
      query.question = { $regex: search.trim(), $options: 'i' };
    }

    const totalItems = await Question.countDocuments(query);

    const questions = await Question.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: questions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems: totalItems,
        hasNextPage: page * limit < totalItems
      }
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت بانک سوالات معلم:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت سوالات سرور' });
  }
};

export const createTeacherQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { type, difficulty, question, options, answer, audioUrl, source_image, tags } = req.body;

    if (!type || !question) {
      res.status(400).json({ success: false, message: 'نوع سوال و متن سوال الزامی است' });
      return;
    }

    const newQuestion = await Question.create({
      createdBy: userId,
      type,
      difficulty: difficulty || 'متوسط',
      question,
      options: options || [],
      answer: answer || '',
      audioUrl: audioUrl || '',
      source_image: source_image || '',
      tags: tags || [],
      status: 'تایید-شده', // سوالات معلم مستقیم تایید می‌شوند
      isActive: true,
      has_image: !!source_image,
      has_audio: !!audioUrl,
    });

    res.status(201).json({
      success: true,
      message: 'سوال با موفقیت به بانک سوالات شما اضافه شد',
      data: newQuestion
    });
  } catch (error: any) {
    logger.error('❌ خطا در ساخت سوال معلم:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ساخت سوال' });
  }
};
export const updateTeacherQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;
    const { type, difficulty, question, options, answer, audioUrl, source_image, tags } = req.body;

    const existingQuestion = await Question.findOne({ _id: id, createdBy: userId });
    if (!existingQuestion) {
      res.status(404).json({ success: false, message: 'سوال یافت نشد یا شما دسترسی ویرایش ندارید' });
      return;
    }

    existingQuestion.type = type || existingQuestion.type;
    existingQuestion.difficulty = difficulty || existingQuestion.difficulty;
    if (question) existingQuestion.question = question;
    if (options) existingQuestion.options = options;
    if (answer !== undefined) existingQuestion.answer = answer;
    if (audioUrl !== undefined) existingQuestion.audioUrl = audioUrl;
    if (source_image !== undefined) existingQuestion.source_image = source_image;
    if (tags) existingQuestion.tags = tags;
    
    existingQuestion.has_image = !!existingQuestion.source_image;
    existingQuestion.has_audio = !!existingQuestion.audioUrl;

    await existingQuestion.save();

    res.status(200).json({
      success: true,
      message: 'سوال با موفقیت ویرایش شد',
      data: existingQuestion
    });
  } catch (error: any) {
    logger.error('❌ خطا در ویرایش سوال معلم:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در ویرایش سوال' });
  }
};

export const deleteTeacherQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    const existingQuestion = await Question.findOne({ _id: id, createdBy: userId });
    if (!existingQuestion) {
      res.status(404).json({ success: false, message: 'سوال یافت نشد یا شما دسترسی حذف ندارید' });
      return;
    }

    await existingQuestion.deleteOne();

    res.status(200).json({
      success: true,
      message: 'سوال با موفقیت حذف شد'
    });
  } catch (error: any) {
    logger.error('❌ خطا در حذف سوال معلم:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در حذف سوال' });
  }
};
