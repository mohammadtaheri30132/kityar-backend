//backend/src/modules/admin/controllers/bookController.ts
import { Request, Response } from 'express'
import { Question } from '../../../core/models/Question.js'
import { logger } from '../../../core/utils/logger.js'
import { Book } from '../../../core/models/Book.js'

// @desc    دریافت همه درس‌های یک پایه
// @route   GET /api/books/grade/:gradeId
// @access  Private
export const getBooksByGrade = async (req: Request, res: Response): Promise<void> => {
  try {
    const { gradeId } = req.params

    const books = await Book.find({ grade: gradeId, isActive: true })
      .sort({ order: 1 })
      .lean()

    // محاسبه تعداد سوالات هر درس
    const booksWithStats = await Promise.all(
      books.map(async (book) => {
        const questionCount = await Question.countDocuments({
          book: book._id,
          isActive: true,
        })

        return {
          ...book,
          totalQuestions: questionCount,
        }
      })
    )

    res.status(200).json({
      success: true,
      count: booksWithStats.length,
      data: booksWithStats,
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت درس‌ها:', error.message)
    res.status(500).json({
      success: false,
      message: '❌ خطای سرور در دریافت درس‌ها',
      error: 'BOOKS_ERROR',
    })
  }
}

// @desc    دریافت یک درس با سوالاتش
// @route   GET /api/books/:id
// @access  Private
export const getBookById = async (req: Request, res: Response): Promise<void> => {
  try {
    const book = await Book.findById(req.params.id)
      .populate('grade', 'name')
      .lean()

    if (!book) {
      res.status(404).json({
        success: false,
        message: '⚠️ درس مورد نظر یافت نشد',
        error: 'BOOK_NOT_FOUND',
      })
      return
    }

    res.status(200).json({
      success: true,
      data: book,
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت درس:', error.message)
    res.status(500).json({
      success: false,
      message: '❌ خطای سرور در دریافت درس',
      error: 'BOOK_ERROR',
    })
  }
}
