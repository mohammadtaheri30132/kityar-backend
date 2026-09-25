import { Request, Response } from 'express'
import { Task } from '../../../core/models/Task.js'
import { logger } from '../../../core/utils/logger.js'

export const getTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { status, dueDate } = req.query

    const query: any = { teacherId: userId }
    if (status) query.status = status
    if (dueDate) query.dueDate = dueDate

    const tasks = await Task.find(query).sort({ dueDate: 1, createdAt: -1 })
    res.json({ success: true, data: tasks })
  } catch (error) {
    logger.error('Error in getTasks:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت کارها' })
  }
}

export const createTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const taskData = { ...req.body, teacherId: userId }

    if (!taskData.title) {
      res.status(400).json({ success: false, message: 'عنوان کار الزامی است' })
      return
    }

    const task = new Task(taskData)
    await task.save()
    res.status(201).json({ success: true, data: task })
  } catch (error) {
    logger.error('Error in createTask:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ایجاد کار' })
  }
}

export const updateTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { id } = req.params

    const task = await Task.findOneAndUpdate(
      { _id: id, teacherId: userId },
      req.body,
      { new: true, runValidators: true }
    )

    if (!task) {
      res.status(404).json({ success: false, message: 'کار یافت نشد یا شما دسترسی ندارید' })
      return
    }

    res.json({ success: true, data: task })
  } catch (error) {
    logger.error('Error in updateTask:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در بروزرسانی کار' })
  }
}

export const deleteTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { id } = req.params

    const task = await Task.findOneAndDelete({ _id: id, teacherId: userId })
    if (!task) {
      res.status(404).json({ success: false, message: 'کار یافت نشد یا شما دسترسی ندارید' })
      return
    }

    res.json({ success: true, message: 'کار با موفقیت حذف شد' })
  } catch (error) {
    logger.error('Error in deleteTask:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در حذف کار' })
  }
}
