import { Request, Response } from 'express'
import { SystemEvent } from '../../../core/models/SystemEvent.js'
import { logger } from '../../../core/utils/logger.js'

export const getActiveSystemEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query

    const query: any = { active: true }
    
    // Optional date filtering
    if (startDate && endDate) {
      query.startDate = { $lte: endDate }
      query.endDate = { $gte: startDate }
    }

    const events = await SystemEvent.find(query).sort({ startDate: 1 })
    res.json({ success: true, data: events })
  } catch (error) {
    logger.error('Error in getActiveSystemEvents:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت مناسبت‌ها' })
  }
}
