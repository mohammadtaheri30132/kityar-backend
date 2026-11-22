import { Request, Response } from 'express'
import { Announcement } from '../../../core/models/Announcement.js'
import { NotificationService } from '../../../core/services/notificationService.js'
import { logger } from '../../../core/utils/logger.js'

export const getAnnouncements = async (req: Request, res: Response): Promise<void> => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 })
    res.json({ success: true, data: announcements })
  } catch (error) {
    logger.error('Error in getAnnouncements:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت اطلاعیه‌ها' })
  }
}

export const createAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const announcement = new Announcement(req.body)
    await announcement.save()

    // ارسال خودکار نوتیفیکیشن همگانی و درون‌برنامه‌ای در صورت فعال بودن اطلاعیه
    if (announcement.active) {
      const priorityMap: Record<string, 'normal' | 'high' | 'urgent'> = {
        low: 'normal',
        normal: 'normal',
        high: 'high',
      };
      NotificationService.send({
        recipientType: 'all',
        title: announcement.title,
        body: announcement.shortMessage,
        type: 'ADMIN_ANNOUNCEMENT',
        priority: priorityMap[announcement.priority] || 'normal',
        targetId: announcement._id.toString(),
        data: {
          announcementId: announcement._id.toString(),
          type: 'ADMIN_ANNOUNCEMENT',
        },
      }).catch((notifErr) => {
        logger.warn('Failed to dispatch announcement notification:', notifErr)
      })
    }

    res.status(201).json({ success: true, data: announcement })
  } catch (error) {
    logger.error('Error in createAnnouncement:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ایجاد اطلاعیه' })
  }
}

export const updateAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const announcement = await Announcement.findByIdAndUpdate(id, req.body, { new: true, runValidators: true })
    if (!announcement) {
      res.status(404).json({ success: false, message: 'اطلاعیه یافت نشد' })
      return
    }
    res.json({ success: true, data: announcement })
  } catch (error) {
    logger.error('Error in updateAnnouncement:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در بروزرسانی' })
  }
}

export const deleteAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const announcement = await Announcement.findByIdAndDelete(id)
    if (!announcement) {
      res.status(404).json({ success: false, message: 'اطلاعیه یافت نشد' })
      return
    }
    res.json({ success: true, message: 'با موفقیت حذف شد' })
  } catch (error) {
    logger.error('Error in deleteAnnouncement:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در حذف' })
  }
}
