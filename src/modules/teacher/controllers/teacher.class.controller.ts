import { Request, Response } from 'express'
import { TeacherClass } from '../../../core/models/TeacherClass.js'
import { logger } from '../../../core/utils/logger.js'

export const getClasses = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const classes = await TeacherClass.find({ teacherId: userId }).populate('schoolId', 'name').sort({ name: 1 })
    res.json({ success: true, data: classes })
  } catch (error) {
    logger.error('Error in getClasses:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت کلاس‌ها' })
  }
}

export const createClass = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const classData = { ...req.body, teacherId: userId }

    if (!classData.name || !classData.schoolId) {
      res.status(400).json({ success: false, message: 'نام کلاس و مدرسه الزامی است' })
      return
    }

    const teacherClass = new TeacherClass(classData)
    await teacherClass.save()
    res.status(201).json({ success: true, data: teacherClass })
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ success: false, message: 'این کلاس قبلا در این مدرسه ثبت شده است' })
      return
    }
    logger.error('Error in createClass:', error)
    res.status(500).json({ success: false, message: 'خطای سرور در ایجاد کلاس' })
  }
}
