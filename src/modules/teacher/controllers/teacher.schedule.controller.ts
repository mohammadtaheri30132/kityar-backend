import { Request, Response } from 'express'
import { WeeklySchedule } from '../../../core/models/WeeklySchedule.js'
import { logger } from '../../../core/utils/logger.js'

export const getSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const schedule = await WeeklySchedule.find({ teacherId: userId })
      .populate('schoolId', 'name')
      .populate('classId', 'name')
      .sort({ dayOfWeek: 1, startTime: 1 })
    res.json({ success: true, data: schedule })
  } catch (error) {
    logger.error('Error in getSchedule:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت برنامه هفتگی' })
  }
}

export const createSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const scheduleData = { ...req.body, teacherId: userId }

    const scheduleItem = new WeeklySchedule(scheduleData)
    await scheduleItem.save()
    res.status(201).json({ success: true, data: scheduleItem })
  } catch (error) {
    logger.error('Error in createSchedule:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ذخیره برنامه هفتگی' })
  }
}
