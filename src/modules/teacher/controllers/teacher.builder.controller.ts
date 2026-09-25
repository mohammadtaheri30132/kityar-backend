import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Course } from '../../../core/models/Course.js';
import { Field } from '../../../core/models/Field.js';
import { Grade } from '../../../core/models/Grade.js';
import { Book } from '../../../core/models/Book.js';
import { Question } from '../../../core/models/Question.js';
import { AuthRequest } from '../../../core/middleware/auth.js';
import { logger } from '../../../core/utils/logger.js';
// ۱. دریافت دوره‌ها
export const getCourses = async (req: Request, res: Response): Promise<void> => {
  try {
    const courses = await Course.find({ isActive: true }).sort({ order: 1 });
    res.json({ success: true, data: courses });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت دوره‌ها' });
  }
};

// ۲. دریافت رشته‌ها و پایه‌ها
export const getFieldsAndGrades = async (req: Request, res: Response): Promise<void> => {
  try {
    const { courseId } = req.params;
    const fields = await Field.find({ course: courseId, isActive: true }).sort({ order: 1 });
    const grades = await Grade.find({ course: courseId, isActive: true }).sort({ order: 1 });
    res.json({ success: true, data: { fields, grades } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت رشته‌ها و پایه‌ها' });
  }
};

// ۳. دریافت درس‌ها
export const getBooks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { gradeId } = req.params;
    const books = await Book.find({ grade: gradeId, isActive: true }).sort({ order: 1 });
    res.json({ success: true, data: books });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت درس‌ها' });
  }
};

// ۴. دریافت فصل‌های دارای سوال
export const getLessons = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params;
    const lessons = await Question.distinct('lesson_id', { book: bookId, isActive: true });
    res.json({ success: true, data: lessons.sort((a: number, b: number) => a - b) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت فصل‌ها' });
  }
};

export const generateRandomQuestions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bookId, lessonId, count } = req.body;
    
    if (!bookId) {
      res.status(400).json({ success: false, message: 'انتخاب درس الزامی است' });
      return;
    }

    const limitNum = parseInt(count as string) || 10;
    
    const matchStage: any = {
      book: new mongoose.Types.ObjectId(bookId),
      isActive: true,
      status: 'تایید-شده'
    };

    // 👈 پشتیبانی هوشمند از آرایه فصل‌ها یا همه فصل‌ها
    if (lessonId && lessonId !== 'all') {
      if (Array.isArray(lessonId) && !lessonId.includes('all')) {
        // اگر آرایه‌ای از اعداد فرستاده شد (مثلا [1, 2, 3])
        matchStage.lesson_id = { $in: lessonId.map(Number) };
      } else if (!Array.isArray(lessonId)) {
        // اگر فقط یک عدد فرستاده شد (حالت قبلی)
        matchStage.lesson_id = parseInt(lessonId as string);
      }
    }

    const questions = await Question.aggregate([
      { $match: matchStage },
      { $sample: { size: limitNum } }
    ]);

    res.json({ success: true, count: questions.length, data: questions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطای سرور در تولید سوال' });
  }
};

export const uploadPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'فایلی دریافت نشد' });
      return;
    }
    // در حالت واقعی اینجا آدرس دامنه شما (مثل vasehkhoneh.ir) قرار می‌گیرد
    const baseUrl = process.env.CLIENT_URL || 'http://192.168.1.128:5001';
    const fileLink = `${baseUrl}/uploads/${req.file.filename}`;
    
    res.json({ success: true, link: fileLink });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ساخت لینک دانلود' });
  }
};
export const uploadMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'هیچ فایلی ارسال نشده است' });
      return;
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileLink = `${baseUrl}/uploads/${req.file.filename}`;
    res.status(200).json({ success: true, link: fileLink });
  } catch (error) {
    logger.error('❌ خطا در آپلود مدیا:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};
