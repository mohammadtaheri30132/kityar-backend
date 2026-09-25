//backend/src/modules/admin/controllers/gradeController.ts
import { Request, Response } from 'express'
import { Grade } from '../../../core/models/Grade.js'
import { Book } from '../../../core/models/Book.js'
import { Question } from '../../../core/models/Question.js'
import { logger } from '../../../core/utils/logger.js'

export const getGradesByCourse = async (req: Request, res: Response): Promise<void> => {
  try {
    const { courseId } = req.params
    const { field } = req.query

    const filter: any = { course: courseId, isActive: true }
    if (field) filter.field = field

    const grades = await Grade.find(filter).sort({ order: 1 }).populate('field', 'name').lean()

    const gradesWithStats = await Promise.all(grades.map(async (grade) => {
      const questionCount = await Question.countDocuments({ grade: grade._id, isActive: true })
      return { ...grade, totalQuestions: questionCount }
    }))

    res.status(200).json({ success: true, data: gradesWithStats })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت پایه‌ها:', error.message)
    res.status(500).json({ success: false, message: '❌ خطا در دریافت پایه‌ها' })
  }
}

export const getGradeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const grade = await Grade.findById(req.params.id).populate('course field')
    if (!grade) {
      res.status(404).json({ success: false, message: '⚠️ پایه یافت نشد' })
      return
    }
    const books = await Book.find({ grade: grade._id, isActive: true }).sort({ order: 1 }).lean()
    const booksWithStats = await Promise.all(books.map(async (book) => {
      const count = await Question.countDocuments({ book: book._id, isActive: true })
      return { ...book, totalQuestions: count }
    }))
    res.status(200).json({ success: true, data: { ...grade.toObject(), books: booksWithStats } })
  } catch (error: any) {
    logger.error('❌ خطا:', error.message)
    res.status(500).json({ success: false, message: '❌ خطای سرور' })
  }
}
