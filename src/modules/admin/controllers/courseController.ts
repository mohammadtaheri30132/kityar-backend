//backend/src/modules/admin/controllers/courseController.ts
import { Request, Response } from 'express'
import { Course } from '../../../core/models/Course.js'
import { Grade } from '../../../core/models/Grade.js'
import { Question } from '../../../core/models/Question.js'
import { logger } from '../../../core/utils/logger.js'

// @desc    دریافت همه دوره‌ها
// @route   GET /api/courses
// @access  Private
export const getCourses = async (req: Request, res: Response): Promise<void> => {
  try {
    const courses = await Course.find({ isActive: true })
      .sort({ order: 1 })
      .lean()

    // محاسبه تعداد سوالات واقعی هر دوره از دیتابیس
    const coursesWithStats = await Promise.all(
      courses.map(async (course) => {
        const questionCount = await Question.countDocuments({
          course: course._id,
          isActive: true,
        })

        return {
          ...course,
          totalQuestions: questionCount,
        }
      })
    )

    res.status(200).json({
      success: true,
      count: coursesWithStats.length,
      data: coursesWithStats,
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت دوره‌ها:', error.message)
    res.status(500).json({
      success: false,
      message: '❌ خطای سرور در دریافت دوره‌ها',
      error: 'COURSES_ERROR',
    })
  }
}

// @desc    دریافت یک دوره با پایه‌هایش
// @route   GET /api/courses/:id
// @access  Private
export const getCourseById = async (req: Request, res: Response): Promise<void> => {
  try {
    const course = await Course.findById(req.params.id)

    if (!course) {
      res.status(404).json({
        success: false,
        message: '⚠️ دوره مورد نظر یافت نشد',
        error: 'COURSE_NOT_FOUND',
      })
      return
    }

    // دریافت پایه‌های این دوره
    const grades = await Grade.find({ course: course._id, isActive: true })
      .sort({ order: 1 })
      .lean()

    // محاسبه تعداد سوالات هر پایه
    const gradesWithStats = await Promise.all(
      grades.map(async (grade) => {
        const questionCount = await Question.countDocuments({
          grade: grade._id,
          isActive: true,
        })

        return {
          ...grade,
          totalQuestions: questionCount,
        }
      })
    )

    res.status(200).json({
      success: true,
      data: {
        ...course.toObject(),
        grades: gradesWithStats,
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت دوره:', error.message)
    res.status(500).json({
      success: false,
      message: '❌ خطای سرور در دریافت دوره',
      error: 'COURSE_ERROR',
    })
  }
}
