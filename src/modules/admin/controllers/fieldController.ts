import { Request, Response } from 'express'
import { Field } from '../../../core/models/Field.js'
import { logger } from '../../../core/utils/logger.js'

export const getFieldsByCourse = async (req: Request, res: Response): Promise<void> => {
  try {
    const fields = await Field.find({ course: req.params.courseId, isActive: true }).sort({ order: 1 })
    res.status(200).json({ success: true, data: fields })
  } catch (error: any) {
    logger.error('❌ خطا در دریافت رشته‌ها:', error.message)
    res.status(500).json({ success: false, message: '❌ خطا در دریافت رشته‌ها' })
  }
}
