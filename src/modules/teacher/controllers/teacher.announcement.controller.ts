import { Request, Response } from 'express'
import { Announcement } from '../../../core/models/Announcement.js'
import { TeacherAnnouncementState } from '../../../core/models/TeacherAnnouncementState.js'
import { logger } from '../../../core/utils/logger.js'

export const getActiveAnnouncements = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { date } = req.query // e.g. 1405-07-25, current date to check against

    if (!date) {
      res.status(400).json({ success: false, message: 'تاریخ فعلی الزامی است' })
      return
    }

    // Find all active announcements in date range
    const activeAnnouncements = await Announcement.find({
      active: true,
      startDate: { $lte: date },
      endDate: { $gte: date }
    }).sort({ priority: -1, createdAt: -1 }) // high priority first

    // Find which ones this teacher has dismissed
    const dismissedStates = await TeacherAnnouncementState.find({
      teacherId: userId,
      announcementId: { $in: activeAnnouncements.map(a => a._id) }
    })
    
    const dismissedIds = new Set(dismissedStates.map(s => s.announcementId.toString()))

    // Filter out dismissed
    const visibleAnnouncements = activeAnnouncements.filter(a => !dismissedIds.has(a._id.toString()))

    res.json({ success: true, data: visibleAnnouncements })
  } catch (error) {
    logger.error('Error in getActiveAnnouncements:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت اطلاعیه‌ها' })
  }
}

export const dismissAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { id } = req.params

    const state = new TeacherAnnouncementState({
      teacherId: userId,
      announcementId: id
    })

    await state.save()
    res.json({ success: true, message: 'اطلاعیه مخفی شد' })
  } catch (error: any) {
    if (error.code === 11000) {
      res.json({ success: true, message: 'قبلا مخفی شده است' })
      return
    }
    logger.error('Error in dismissAnnouncement:', error)
    res.status(500).json({ success: false, message: 'خطای سرور' })
  }
}
