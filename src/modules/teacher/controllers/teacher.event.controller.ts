import { Request, Response } from 'express'
import { TeacherEvent } from '../../../core/models/TeacherEvent.js'
import { logger } from '../../../core/utils/logger.js'

export const getEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { startDate, endDate } = req.query

    const query: any = { teacherId: userId }
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate }
    } else if (startDate) {
      query.date = { $gte: startDate }
    } else if (endDate) {
      query.date = { $lte: endDate }
    }

    const events = await TeacherEvent.find(query).sort({ date: 1, startTime: 1 })
    res.json({ success: true, data: events })
  } catch (error) {
    logger.error('Error in getEvents:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت رویدادها' })
  }
}

export const createEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const eventData = { ...req.body, teacherId: userId }

    if (!eventData.title || !eventData.date) {
      res.status(400).json({ success: false, message: 'عنوان و تاریخ الزامی است' })
      return
    }

    const event = new TeacherEvent(eventData)
    await event.save()
    res.status(201).json({ success: true, data: event })
  } catch (error) {
    logger.error('Error in createEvent:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ایجاد رویداد' })
  }
}

export const updateEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { id } = req.params

    const event = await TeacherEvent.findOneAndUpdate(
      { _id: id, teacherId: userId },
      req.body,
      { new: true, runValidators: true }
    )

    if (!event) {
      res.status(404).json({ success: false, message: 'رویداد یافت نشد یا شما دسترسی ندارید' })
      return
    }

    res.json({ success: true, data: event })
  } catch (error) {
    logger.error('Error in updateEvent:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در بروزرسانی رویداد' })
  }
}

export const deleteEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { id } = req.params

    const event = await TeacherEvent.findOneAndDelete({ _id: id, teacherId: userId })
    if (!event) {
      res.status(404).json({ success: false, message: 'رویداد یافت نشد یا شما دسترسی ندارید' })
      return
    }

    res.json({ success: true, message: 'رویداد با موفقیت حذف شد' })
  } catch (error) {
    logger.error('Error in deleteEvent:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در حذف رویداد' })
  }
}
