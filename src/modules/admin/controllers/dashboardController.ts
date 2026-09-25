import { Response } from 'express'
import { AuthRequest } from '../../../core/middleware/auth.js'
import { User } from '../../../core/models/User.js'
import { Question } from '../../../core/models/Question.js'
import { Course } from '../../../core/models/Course.js'
import { logger } from '../../../core/utils/logger.js'

// @desc    دریافت آمار داشبورد
// @route   GET /api/dashboard
// @access  Private
export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // تعداد معلمان
    const teachersCount = await User.countDocuments({ role: 'teacher', isActive: true })

    // تعداد دانش‌آموزان (این فعلاً mock هست - می‌تونی بعداً مدل Student اضافه کنی)
    const studentsCount = 5632

    // آمار سوالات
    const totalQuestions = await Question.countDocuments({ isActive: true })

    const questionsByType = await Question.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ])

    // سوالات اضافه شده در ۳۰ روز اخیر
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentQuestions = await Question.countDocuments({
      isActive: true,
      createdAt: { $gte: thirtyDaysAgo },
    })

    // سوالات به تفکیک دوره
    const questionsByCourse = await Course.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: 'questions',
          localField: '_id',
          foreignField: 'course',
          as: 'questions',
        },
      },
      {
        $project: {
          name: 1,
          code: 1,
          totalQuestions: { $size: '$questions' },
        },
      },
    ])

    // فعالیت‌های اخیر (۱۰ سوال آخر)
    const recentActivities = await Question.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('createdBy', 'fullName username')
      .select('question_id type difficulty createdAt')
      .lean()

    const activities = recentActivities.map((q) => ({
      text: `سوال ${q.type} جدید اضافه شد`,
      user: (q.createdBy as any)?.fullName || 'نامشخص',
      time: q.createdAt,
      questionId: q.question_id,
    }))

    res.status(200).json({
      success: true,
      data: {
        teachers: teachersCount,
        students: studentsCount,
        questions: {
          total: totalQuestions,
          recent: recentQuestions,
          byType: questionsByType.reduce((acc: any, curr: any) => {
            acc[curr._id] = curr.count
            return acc
          }, {}),
          byCourse: questionsByCourse.map((c) => ({
            name: c.name,
            code: c.code,
            count: c.totalQuestions,
          })),
        },
        activities,
      },
    })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت آمار داشبورد:', error.message)
    res.status(500).json({
      success: false,
      message: '❌ خطای سرور در دریافت آمار داشبورد',
      error: 'DASHBOARD_ERROR',
    })
  }
}
