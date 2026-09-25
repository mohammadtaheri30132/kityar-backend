import { Request, Response } from 'express'
import { SystemEvent } from '../../../core/models/SystemEvent.js'
import { logger } from '../../../core/utils/logger.js'

export const getSystemEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const events = await SystemEvent.find().sort({ startDate: 1 })
    res.json({ success: true, data: events })
  } catch (error) {
    logger.error('Error in getSystemEvents:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

export const createSystemEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const event = new SystemEvent(req.body)
    await event.save()
    res.status(201).json({ success: true, data: event })
  } catch (error) {
    logger.error('Error in createSystemEvent:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

export const updateSystemEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const event = await SystemEvent.findByIdAndUpdate(id, req.body, { new: true, runValidators: true })
    if (!event) {
      res.status(404).json({ success: false, message: 'یافت نشد' })
      return
    }
    res.json({ success: true, data: event })
  } catch (error) {
    logger.error('Error in updateSystemEvent:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}

export const deleteSystemEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const event = await SystemEvent.findByIdAndDelete(id)
    if (!event) {
      res.status(404).json({ success: false, message: 'یافت نشد' })
      return
    }
    res.json({ success: true, message: 'حذف شد' })
  } catch (error) {
    logger.error('Error in deleteSystemEvent:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}
