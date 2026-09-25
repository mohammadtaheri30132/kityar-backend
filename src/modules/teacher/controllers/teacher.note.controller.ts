import { Request, Response } from 'express'
import { DailyNote } from '../../../core/models/DailyNote.js'
import { logger } from '../../../core/utils/logger.js'

export const getNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { date } = req.query

    const query: any = { teacherId: userId }
    if (date) query.date = date

    const notes = await DailyNote.find(query).sort({ createdAt: -1 })
    res.json({ success: true, data: notes })
  } catch (error) {
    logger.error('Error in getNotes:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت یادداشت‌ها' })
  }
}

export const createNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const noteData = { ...req.body, teacherId: userId }

    if (!noteData.date || !noteData.content) {
      res.status(400).json({ success: false, message: 'تاریخ و متن یادداشت الزامی است' })
      return
    }

    const note = new DailyNote(noteData)
    await note.save()
    res.status(201).json({ success: true, data: note })
  } catch (error) {
    logger.error('Error in createNote:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ایجاد یادداشت' })
  }
}

export const updateNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { id } = req.params

    const note = await DailyNote.findOneAndUpdate(
      { _id: id, teacherId: userId },
      req.body,
      { new: true, runValidators: true }
    )

    if (!note) {
      res.status(404).json({ success: false, message: 'یادداشت یافت نشد یا شما دسترسی ندارید' })
      return
    }

    res.json({ success: true, data: note })
  } catch (error) {
    logger.error('Error in updateNote:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در بروزرسانی یادداشت' })
  }
}

export const deleteNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { id } = req.params

    const note = await DailyNote.findOneAndDelete({ _id: id, teacherId: userId })
    if (!note) {
      res.status(404).json({ success: false, message: 'یادداشت یافت نشد یا شما دسترسی ندارید' })
      return
    }

    res.json({ success: true, message: 'یادداشت با موفقیت حذف شد' })
  } catch (error) {
    logger.error('Error in deleteNote:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در حذف یادداشت' })
  }
}
