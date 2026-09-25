import { Request, Response } from 'express'
import { School } from '../../../core/models/School.js'
import { logger } from '../../../core/utils/logger.js'

export const getSchools = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const schools = await School.find({ teacherId: userId }).sort({ name: 1 })
    res.json({ success: true, data: schools })
  } catch (error) {
    logger.error('Error in getSchools:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت مدارس' })
  }
}

export const createSchool = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const schoolData = { ...req.body, teacherId: userId }

    if (!schoolData.name) {
      res.status(400).json({ success: false, message: 'نام مدرسه الزامی است' })
      return
    }

    const school = new School(schoolData)
    await school.save()
    res.status(201).json({ success: true, data: school })
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ success: false, message: 'این مدرسه قبلا ثبت شده است' })
      return
    }
    logger.error('Error in createSchool:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ایجاد مدرسه' })
  }
}
