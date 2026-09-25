import { Request, Response } from 'express'
import { Course } from '../../../core/models/Course.js'
import { Field } from '../../../core/models/Field.js'
import { Grade } from '../../../core/models/Grade.js'
import { Book } from '../../../core/models/Book.js'
import { Question } from '../../../core/models/Question.js'
import { logger } from '../../../core/utils/logger.js'

// ==================== Course ====================
export const createCourse = async (req: Request, res: Response) => {
  try {
    const course = await Course.create(req.body)
    res.status(201).json({ success: true, data: course, message: '✅ دوره ایجاد شد' })
  } catch (error: any) {
    logger.error('❌ خطا:', error.message)
    res.status(500).json({ success: false, message: '❌ خطا در ایجاد دوره' })
  }
}

export const updateCourse = async (req: Request, res: Response) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    if (!course) { res.status(404).json({ success: false, message: '⚠️ دوره یافت نشد' }); return }
    res.json({ success: true, data: course, message: '✅ دوره ویرایش شد' })
  } catch (error: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const deleteCourse = async (req: Request, res: Response) => {
  try {
    const course = await Course.findById(req.params.id)
    if (!course) { res.status(404).json({ success: false, message: '⚠️ دوره یافت نشد' }); return }
    
    const fields = await Field.find({ course: course._id })
    for (const field of fields) {
      const grades = await Grade.find({ field: field._id })
      for (const grade of grades) {
        await Book.deleteMany({ grade: grade._id })
        await Question.deleteMany({ grade: grade._id })
      }
      await Grade.deleteMany({ field: field._id })
    }
    await Field.deleteMany({ course: course._id })
    await Question.deleteMany({ course: course._id })
    await course.deleteOne()
    
    res.json({ success: true, message: '✅ دوره و تمام زیرمجموعه‌ها حذف شدند' })
  } catch (error: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

// ==================== Field ====================
export const createField = async (req: Request, res: Response) => {
  try {
    const field = await Field.create(req.body)
    res.status(201).json({ success: true, data: field, message: '✅ رشته ایجاد شد' })
  } catch (error: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const updateField = async (req: Request, res: Response) => {
  try {
    const field = await Field.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!field) { res.status(404).json({ success: false, message: '⚠️ رشته یافت نشد' }); return }
    res.json({ success: true, data: field, message: '✅ رشته ویرایش شد' })
  } catch (error: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const deleteField = async (req: Request, res: Response) => {
  try {
    const field = await Field.findById(req.params.id)
    if (!field) { res.status(404).json({ success: false, message: '⚠️ رشته یافت نشد' }); return }
    
    const grades = await Grade.find({ field: field._id })
    for (const grade of grades) {
      await Book.deleteMany({ grade: grade._id })
      await Question.deleteMany({ grade: grade._id })
    }
    await Grade.deleteMany({ field: field._id })
    await field.deleteOne()
    
    res.json({ success: true, message: '✅ رشته و زیرمجموعه‌ها حذف شدند' })
  } catch (error: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

// ==================== Grade ====================
export const createGrade = async (req: Request, res: Response) => {
  try {
    // اعتبارسنجی
    if (!req.body.course || !req.body.field || !req.body.name) {
      res.status(400).json({ success: false, message: '⚠️ دوره، رشته و نام پایه الزامی است' })
      return
    }
    const grade = await Grade.create(req.body)
    res.status(201).json({ success: true, data: grade, message: '✅ پایه ایجاد شد' })
  } catch (error: any) { 
    logger.error('❌ خطا:', error.message)
    res.status(500).json({ success: false, message: '❌ خطا در ایجاد پایه' }) 
  }
}

export const updateGrade = async (req: Request, res: Response) => {
  try {
    const grade = await Grade.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!grade) { res.status(404).json({ success: false, message: '⚠️ پایه یافت نشد' }); return }
    res.json({ success: true, data: grade, message: '✅ پایه ویرایش شد' })
  } catch (error: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const deleteGrade = async (req: Request, res: Response) => {
  try {
    const grade = await Grade.findById(req.params.id)
    if (!grade) { res.status(404).json({ success: false, message: '⚠️ پایه یافت نشد' }); return }
    await Book.deleteMany({ grade: grade._id })
    await Question.deleteMany({ grade: grade._id })
    await grade.deleteOne()
    res.json({ success: true, message: '✅ پایه و درس‌هایش حذف شدند' })
  } catch (error: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

// ==================== Book ====================
export const createBook = async (req: Request, res: Response) => {
  try {
    const book = await Book.create(req.body)
    res.status(201).json({ success: true, data: book, message: '✅ درس ایجاد شد' })
  } catch (error: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const updateBook = async (req: Request, res: Response) => {
  try {
    const book = await Book.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!book) { res.status(404).json({ success: false, message: '⚠️ درس یافت نشد' }); return }
    res.json({ success: true, data: book, message: '✅ درس ویرایش شد' })
  } catch (error: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const deleteBook = async (req: Request, res: Response) => {
  try {
    const book = await Book.findByIdAndDelete(req.params.id)
    if (!book) { res.status(404).json({ success: false, message: '⚠️ درس یافت نشد' }); return }
    await Question.deleteMany({ book: book._id })
    res.json({ success: true, message: '✅ درس و سوالاتش حذف شدند' })
  } catch (error: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}
