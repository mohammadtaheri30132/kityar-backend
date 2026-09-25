import mongoose from 'mongoose'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { User } from '../models/User.js'
import { Course } from '../models/Course.js'
import { Field } from '../models/Field.js'
import { Grade } from '../models/Grade.js'
import { Book } from '../models/Book.js'
import { Question } from '../models/Question.js'
import { logger } from './logger.js'
import { v4 as uuidv4 } from 'uuid'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/question-cms'

const seedData = async () => {
  try {
    await mongoose.connect(MONGODB_URI)
    logger.info('✅ اتصال به دیتابیس')

    await Promise.all([
      User.deleteMany({}), Course.deleteMany({}), Field.deleteMany({}),
      Grade.deleteMany({}), Book.deleteMany({}), Question.deleteMany({}),
    ])
    logger.info('🗑️ دیتای قبلی پاک شد')

    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456'
    const admin = await User.create({
      username: process.env.ADMIN_USERNAME || 'admin',
      password: adminPassword, fullName: 'مدیر سیستم', role: 'admin',
    })
    logger.info(`✅ ادمین: ${admin.username} / ${adminPassword}`)

    const [elementary, middle, high] = await Course.insertMany([
      { name: 'دبستان', code: 'ELEMENTARY', description: 'پایه اول تا ششم', order: 1 },
      { name: 'متوسطه اول', code: 'MIDDLE', description: 'پایه هفتم تا نهم', order: 2 },
      { name: 'متوسطه دوم', code: 'HIGH', description: 'پایه دهم تا دوازدهم', order: 3 },
    ])

    const fieldGeneralElem = await Field.create({ name: 'عمومی', course: elementary._id, order: 1 })
    const fieldGeneralMiddle = await Field.create({ name: 'عمومی', course: middle._id, order: 1 })
    const [fieldMath, fieldScience, fieldHuman] = await Field.insertMany([
      { name: 'ریاضی فیزیک', course: high._id, order: 1 },
      { name: 'علوم تجربی', course: high._id, order: 2 },
      { name: 'علوم انسانی', course: high._id, order: 3 },
    ])

    const gradesData: any[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ name: `پایه ${i + 1}`, course: elementary._id, field: fieldGeneralElem._id, order: i + 1 })),
      ...Array.from({ length: 3 }, (_, i) => ({ name: `پایه ${i + 7}`, course: middle._id, field: fieldGeneralMiddle._id, order: i + 1 })),
      ...Array.from({ length: 3 }, (_, i) => ({ name: `پایه ${i + 10}`, course: high._id, field: fieldMath._id, order: i + 1 })),
      ...Array.from({ length: 3 }, (_, i) => ({ name: `پایه ${i + 10}`, course: high._id, field: fieldScience._id, order: i + 1 })),
      ...Array.from({ length: 3 }, (_, i) => ({ name: `پایه ${i + 10}`, course: high._id, field: fieldHuman._id, order: i + 1 })),
    ]
    const grades = await Grade.insertMany(gradesData)
    logger.info(`✅ ${grades.length} پایه`)

    const gradeSubjects: Record<string, { name: string; icon: string }[]> = {
      'پایه 1': [{ name: 'ریاضی اول', icon: '📐' }, { name: 'فارسی اول', icon: '📖' }],
      'پایه 2': [{ name: 'ریاضی دوم', icon: '📐' }, { name: 'فارسی دوم', icon: '📖' }],
      'پایه 3': [{ name: 'ریاضی سوم', icon: '📐' }, { name: 'فارسی سوم', icon: '📖' }],
      'پایه 4': [{ name: 'ریاضی چهارم', icon: '📐' }, { name: 'علوم چهارم', icon: '🔬' }],
      'پایه 5': [{ name: 'ریاضی پنجم', icon: '📐' }, { name: 'هدیه‌های آسمان', icon: '🌟' }],
      'پایه 6': [{ name: 'ریاضی ششم', icon: '📐' }, { name: 'قرآن', icon: '📿' }],
      'پایه 7': [{ name: 'ریاضی هفتم', icon: '📐' }, { name: 'علوم هفتم', icon: '🔬' }],
      'پایه 8': [{ name: 'ریاضی هشتم', icon: '📐' }],
      'پایه 9': [{ name: 'ریاضی نهم', icon: '📐' }],
    }

    const booksData: any[] = []
    for (const grade of grades) {
      const subjects = gradeSubjects[grade.name] || [{ name: `درس ${grade.name}`, icon: '📖' }]
      subjects.forEach((s, idx) => booksData.push({ name: s.name, grade: grade._id, order: idx + 1, icon: s.icon }))
    }

    const highGrades = grades.filter(g => String(g.course) === String(high._id))
    for (const g of highGrades) {
      booksData.push({ name: 'ریاضی', grade: g._id, order: 1, icon: '📐' }, { name: 'فیزیک', grade: g._id, order: 2, icon: '⚡' }, { name: 'شیمی', grade: g._id, order: 3, icon: '🧪' })
    }

    const books = await Book.insertMany(booksData)
    logger.info(`✅ ${books.length} درس`)

    // سوالات نمونه با page_number آرایه‌ای
    const types = ['تستی', 'جاخالی', 'صحیح-غلط', 'کوتاه-پاسخ', 'گسترده-پاسخ', 'جورکردنی', 'انتخاب-کلمه']
    const sampleQuestions: any[] = []
    for (const book of books.slice(0, 8)) {
      for (let i = 0; i < 2; i++) {
        const type = types[i % types.length]
        const grade = await Grade.findById(book.grade)
        sampleQuestions.push({
          question_id: uuidv4(),
          book: book._id, grade: book.grade, course: grade?.course,
          type, difficulty: i === 0 ? 'ساده' : 'متوسط',
          question: `<p dir="rtl">سوال ${type} برای ${book.name}</p>`,
          options: type === 'تستی' ? ['گزینه ۱', 'گزینه ۲', 'گزینه ۳', 'گزینه ۴'] : type === 'انتخاب-کلمه' ? ['کلمه ۱', 'کلمه ۲'] : [],
          answer: type === 'تستی' ? 'گزینه ۲' : type === 'انتخاب-کلمه' ? 'کلمه ۱' : 'پاسخ تستی',
          lesson_id: i + 1,
          page_number: [(i + 1) * 10],
          createdBy: admin._id,
        })
      }
    }

    await Question.insertMany(sampleQuestions)
    logger.info(`✅ ${sampleQuestions.length} سوال نمونه`)

    for (const book of books) {
      const count = await Question.countDocuments({ book: book._id })
      await Book.findByIdAndUpdate(book._id, { totalQuestions: count })
    }
    for (const grade of grades) {
      const count = await Question.countDocuments({ grade: grade._id })
      await Grade.findByIdAndUpdate(grade._id, { totalQuestions: count })
    }
    for (const course of [elementary, middle, high]) {
      const count = await Question.countDocuments({ course: course._id })
      await Course.findByIdAndUpdate(course._id, { totalQuestions: count })
    }

    logger.info('🎉 Seed completed!')
    process.exit(0)
  } catch (error) {
    logger.error('❌ Seed error:', error)
    process.exit(1)
  }
}

seedData()
