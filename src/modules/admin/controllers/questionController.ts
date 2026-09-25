// src/modules/admin/controllers/questionController.ts
import { Request, Response } from 'express'
import { Question } from '../../../core/models/Question.js'
import { Book } from '../../../core/models/Book.js'
import { Grade } from '../../../core/models/Grade.js'
import { Course } from '../../../core/models/Course.js'
import { AuthRequest } from '../../../core/middleware/auth.js'
import { logger } from '../../../core/utils/logger.js'
import { v4 as uuidv4 } from 'uuid'

const DIFFICULTY_MAP: Record<string, string> = { 'سخت': 'دشوار', 'hard': 'دشوار', 'difficult': 'دشوار', 'easy': 'ساده', 'آسان': 'ساده', 'medium': 'متوسط', 'normal': 'متوسط' }
const TYPE_ALIASES: Record<string, string> = {
  'انتخاب کلمه': 'انتخاب-کلمه', 'انتخاب‌کلمه': 'انتخاب-کلمه', 'چندگزینه ای': 'تستی', 'چندگزینه‌ای': 'تستی',
  'چند گزینه ای': 'تستی', 'تست': 'تستی', 'صحیح غلط': 'صحیح-غلط', 'صحیح و غلط': 'صحیح-غلط',
  'جای خالی': 'جاخالی', 'جای‌خالی': 'جاخالی', 'جا خالی': 'جاخالی',
  'کوتاه پاسخ': 'کوتاه-پاسخ', 'کوتاه': 'کوتاه-پاسخ', 'گسترده پاسخ': 'گسترده-پاسخ', 'گسترده': 'گسترده-پاسخ', 'تشریحی': 'گسترده-پاسخ',
  'جور کردنی': 'جورکردنی', 'جور': 'جورکردنی', 'انتخاب': 'انتخاب-کلمه',
}
const VALID_TYPES = ['تستی', 'جاخالی', 'صحیح-غلط', 'کوتاه-پاسخ', 'گسترده-پاسخ', 'جورکردنی', 'انتخاب-کلمه']
const VALID_DIFFICULTIES = ['ساده', 'متوسط', 'دشوار']
const VALID_STATUSES = ['در-حال-بررسی', 'تایید-شده', 'مشکل-دار']

function normalizeDifficulty(input: any): string | null |any {
  if (!input) return null
  const str = String(input).trim()
  if (VALID_DIFFICULTIES.includes(str)) return str
  const lower = str.toLowerCase().replace(/\s+/g, '')
  for (const [k, v] of Object.entries(DIFFICULTY_MAP)) { if (k.toLowerCase().replace(/\s+/g, '') === lower) return v }
  return null
}

function normalizeType(input: any):any| string | null {
  if (!input) return null
  const str = String(input).trim()
  if (VALID_TYPES.includes(str)) return str
  const cleaned = str.replace(/\s+/g, ' ').trim()
  if (TYPE_ALIASES[cleaned]) return TYPE_ALIASES[cleaned]
  const lower = cleaned.toLowerCase()
  for (const [k, v] of Object.entries(TYPE_ALIASES)) { if (k.toLowerCase() === lower) return v }
  return null
}

function normalizeQuestion(question: any, type: string): string {
  if (question && String(question).trim()) return String(question).trim()
  if (type === 'جورکردنی') return '<p dir="rtl">موارد ستون «الف» را با گزینه‌های مناسب از ستون «ب» تطبیق دهید.</p>'
  if (type === 'صحیح-غلط') return '<p dir="rtl">درستی یا نادرستی عبارت زیر را مشخص کنید.</p>'
  return ''
}

function parsePageNumbers(input: any): number[] {
  if (input === undefined || input === null || input === '') return []
  if (Array.isArray(input)) return input.map(Number).filter(n => !isNaN(n) && n > 0)
  let str = String(input).trim(); if (!str) return []
  const rangeMatch = str.match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) { const s = parseInt(rangeMatch[1]), e = parseInt(rangeMatch[2]); if (s > 0 && e >= s) return Array.from({ length: e - s + 1 }, (_, i) => s + i) }
  return str.split(/[,،و/\\\s]+/).filter(Boolean).map(p => parseInt(p.replace(/[^\d]/g, ''))).filter(n => !isNaN(n) && n > 0)
}

function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function detectHasImage(question: string, answer: string, sourceImage: string, subs: any[] = []): boolean {
  if (sourceImage && String(sourceImage).trim()) return true
  if (question && /<img[^>]+>|data:image\//i.test(question)) return true
  if (answer && /<img[^>]+>|data:image\//i.test(answer)) return true
  if (subs && subs.length > 0) {
    for (const s of subs) {
      if (s.question && /<img[^>]+>|data:image\//i.test(s.question)) return true
      if (s.answer && /<img[^>]+>|data:image\//i.test(s.answer)) return true
    }
  }
  return false
}

function getHasImageForImport(q: any, question: string, answer: string, sourceImage: string, subs: any[]): boolean {
  if (q.has_image !== undefined && q.has_image !== null) return Boolean(q.has_image)
  return detectHasImage(question, answer, sourceImage, subs)
}

// ==================== چک تکراری: question + type + answer ====================

function createSeenKey(question: string, type: string, answer: string): string {
  return `${stripHtml(question)}|${type}|${stripHtml(answer)}`
}

async function findDuplicateInDB(question: string, type: string, bookId: string, answer: string = '') {
  const strippedQuestion = stripHtml(question)
  const strippedAnswer = stripHtml(answer)

  const allQuestions = await Question.find({
    book: bookId,
    type,
    isActive: true,
  }).select('_id question answer question_id').lean()

  for (const existing of allQuestions) {
    const existingQuestion = stripHtml(existing.question)
    const existingAnswer = stripHtml(existing.answer || '')
    
    if (existingQuestion === strippedQuestion && existingAnswer === strippedAnswer) {
      return existing
    }
  }

  return null
}

// ==================== Force Import ====================
export const forceImportQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = req.body
    const bookId = q.book || req.body.bookId
    if (!bookId) { res.status(400).json({ success: false, message: '⚠️ درس الزامی است' }); return }

    const book = await Book.findById(bookId).populate('grade')
    if (!book) { res.status(404).json({ success: false, message: '⚠️ درس یافت نشد' }); return }
    const grade = await Grade.findById(book.grade)

    const baseData = {
      book: bookId,
      grade: book.grade,
      course: grade?.course,
      difficulty: normalizeDifficulty(q.difficulty) || 'متوسط',
      lesson_id: q.lesson_id || 1,
      source_image: q.source_image || '',
      createdBy: req.user!._id,
      status: 'در-حال-بررسی',
      tags: [],
    }

    const sub = q.sub
    if (sub && Array.isArray(sub) && sub.length > 0) {
      for (const s of sub) {
        const type = normalizeType(s.type) || 'کوتاه-پاسخ'
        const questionText = s.question || ''
        const answerText = s.answer || ''
        const hasImage = getHasImageForImport(q, questionText, answerText, q.source_image || '', [])
        await Question.create({
          ...baseData,
          question_id: uuidv4(),
          type,
          question: questionText,
          mainQuestion: q.question || '',
          options: s.options || [],
          matching_left: q.matching_left || [],
          matching_right: q.matching_right || [],
          answer: answerText,
          page_number: parsePageNumbers(s.page_number || q.page_number),
          is_composite: false,
          sub: [],
          has_image: hasImage,
        })
      }
    } else {
      const type = normalizeType(q.type) || 'تستی'
      const questionText = normalizeQuestion(q.question, type) || q.question || ''
      const hasImage = getHasImageForImport(q, questionText, q.answer || '', q.source_image || '', [])
      await Question.create({
        ...baseData,
        question_id: uuidv4(),
        type,
        question: questionText,
        mainQuestion: '',
        options: q.options || [],
        matching_left: q.matching_left || [],
        matching_right: q.matching_right || [],
        answer: q.answer || '',
        page_number: parsePageNumbers(q.page_number),
        is_composite: false,
        sub: [],
        has_image: hasImage,
      })
    }

    res.status(201).json({ success: true, message: '✅ سوال اضافه شد' })
  } catch (error: any) {
    logger.error('❌ force import:', error.message)
    res.status(500).json({ success: false, message: '❌ خطا در افزودن اجباری' })
  }
}

// ==================== controllers ====================

export const getQuestionsByBook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params
    const { page = '1', limit = '50', type, difficulty, status, search, hasImage, hasMainQuestion } = req.query
    const pageNum = parseInt(page as string) || 1, limitNum = parseInt(limit as string) || 50, skip = (pageNum - 1) * limitNum
    const filter: any = { book: bookId, isActive: true }
    if (type && type !== 'همه') filter.type = type
    if (difficulty) filter.difficulty = difficulty
    if (status && status !== 'همه') filter.status = status
    if (hasImage && hasImage !== 'همه') filter.has_image = hasImage === 'true'
    if (hasMainQuestion && hasMainQuestion !== 'همه') filter.mainQuestion = hasMainQuestion === 'true' ? { $ne: '' } : ''
    if (search) filter.question = { $regex: search, $options: 'i' }
    const [questions, total] = await Promise.all([Question.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).select('-__v').lean(), Question.countDocuments(filter)])
    res.json({ success: true, count: questions.length, total, totalPages: Math.ceil(total / limitNum), currentPage: pageNum, data: questions })
  } catch (e: any) { logger.error('❌', e.message); res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const getQuestionById = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = await Question.findById(req.params.id).populate('book grade course createdBy', 'name icon code fullName username')
    if (!q) { res.status(404).json({ success: false, message: '⚠️ سوال یافت نشد' }); return }
    res.json({ success: true, data: q })
  } catch (e: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const createQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { answer, book: bookId, tags } = req.body
    if (!bookId) { res.status(400).json({ success: false, message: '⚠️ درس الزامی است' }); return }
    const type = normalizeType(req.body.type)
    if (!type) { res.status(400).json({ success: false, message: '⚠️ نوع سوال نامعتبر' }); return }
    const difficulty = normalizeDifficulty(req.body.difficulty)
    if (!difficulty) { res.status(400).json({ success: false, message: '⚠️ درجه سختی نامعتبر' }); return }
    const question = normalizeQuestion(req.body.question, type)
    if (!question) { res.status(400).json({ success: false, message: '⚠️ صورت سوال الزامی است' }); return }

    const dup = await findDuplicateInDB(question, type, bookId, answer || '')
    if (dup) { res.status(409).json({ success: false, message: '⚠️ سوال تکراری', error: 'DUPLICATE_CONTENT', duplicateId: dup._id }); return }

    const book = await Book.findById(bookId).populate('grade')
    if (!book) { res.status(404).json({ success: false, message: '⚠️ درس یافت نشد' }); return }
    const grade = await Grade.findById(book.grade).populate('course')
    const questionTags = Array.isArray(tags) ? tags.filter((t: any) => String(t).trim()) : []
    const hasImage = detectHasImage(question, answer || '', req.body.source_image || '', [])

    await Question.create({
      question_id: uuidv4(),
      book: bookId,
      grade: grade?._id || book.grade,
      course: grade?.course,
      type,
      difficulty,
      question,
      mainQuestion: '',
      options: req.body.options || [],
      matching_left: req.body.matching_left || [],
      matching_right: req.body.matching_right || [],
      answer: answer || '',
      lesson_id: req.body.lesson_id || 1,
      page_number: parsePageNumbers(req.body.page_number),
      source_image: req.body.source_image || '',
      createdBy: req.user!._id,
      is_composite: false,
      sub: [],
      status: 'در-حال-بررسی',
      tags: questionTags,
      has_image: hasImage,
    })
    await Book.findByIdAndUpdate(bookId, { $inc: { totalQuestions: 1 } })
    if (grade) { await Grade.findByIdAndUpdate(grade._id, { $inc: { totalQuestions: 1 } }); await Course.findByIdAndUpdate(grade.course, { $inc: { totalQuestions: 1 } }) }
    res.status(201).json({ success: true, message: '✅ سوال ایجاد شد' })
  } catch (error: any) { logger.error('❌', error.message); res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const batchUpdate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ids, action, value } = req.body
    if (!ids || !Array.isArray(ids) || ids.length === 0) { res.status(400).json({ success: false, message: '⚠️ شناسه‌ها الزامی است' }); return }
    let update: any = {}
    switch (action) {
      case 'status': if (!value || !VALID_STATUSES.includes(value)) { res.status(400).json({ success: false, message: '⚠️ وضعیت نامعتبر' }); return }; update.status = value; break
      case 'add-tag': if (!value || !String(value).trim()) { res.status(400).json({ success: false, message: '⚠️ تگ الزامی است' }); return }; update = { $addToSet: { tags: String(value).trim() } }; break
      case 'remove-tag': if (!value || !String(value).trim()) { res.status(400).json({ success: false, message: '⚠️ تگ الزامی است' }); return }; update = { $pull: { tags: String(value).trim() } }; break
      case 'delete': await Question.updateMany({ _id: { $in: ids } }, { isActive: false }); res.json({ success: true, message: `✅ ${ids.length} سوال حذف شدند` }); return
      default: res.status(400).json({ success: false, message: '⚠️ عملیات نامعتبر' }); return
    }
    await Question.updateMany({ _id: { $in: ids } }, update)
    const msgs: Record<string, string> = { 'status': `✅ وضعیت ${ids.length} سوال تغییر کرد`, 'add-tag': `✅ تگ اضافه شد`, 'remove-tag': `✅ تگ حذف شد` }
    res.json({ success: true, message: msgs[action] || '✅ انجام شد' })
  } catch (e: any) { logger.error('❌', e.message); res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const updateQuestionStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.body
    if (!status || !VALID_STATUSES.includes(status)) { res.status(400).json({ success: false, message: '⚠️ وضعیت نامعتبر' }); return }
    const q = await Question.findByIdAndUpdate(req.params.id, { status }, { new: true })
    if (!q) { res.status(404).json({ success: false, message: '⚠️ سوال یافت نشد' }); return }
    res.json({ success: true, message: '✅ وضعیت بروز شد', data: q })
  } catch (e: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const updateQuestionTags = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tags } = req.body
    if (!Array.isArray(tags)) { res.status(400).json({ success: false, message: '⚠️ تگ‌ها باید آرایه باشند' }); return }
    const q = await Question.findByIdAndUpdate(req.params.id, { tags }, { new: true })
    if (!q) { res.status(404).json({ success: false, message: '⚠️ سوال یافت نشد' }); return }
    res.json({ success: true, message: '✅ تگ‌ها بروز شد', data: q })
  } catch (e: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const updateQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = await Question.findById(req.params.id)
    if (!q) { res.status(404).json({ success: false, message: '⚠️ سوال یافت نشد' }); return }
    const allowed = ['options', 'matching_left', 'matching_right', 'answer', 'lesson_id', 'source_image']
    allowed.forEach(f => { if (req.body[f] !== undefined) (q as any)[f] = req.body[f] })
    if (req.body.type) { const t = normalizeType(req.body.type); if (!t) { res.status(400).json({ success: false, message: '⚠️ نوع سوال نامعتبر' }); return }; q.type = t }
    if (req.body.difficulty) { const d = normalizeDifficulty(req.body.difficulty); if (!d) { res.status(400).json({ success: false, message: '⚠️ سختی نامعتبر' }); return }; q.difficulty = d }
    if (req.body.question !== undefined) q.question = normalizeQuestion(req.body.question, q.type)
    if (req.body.page_number !== undefined) q.page_number = parsePageNumbers(req.body.page_number)
    if (req.body.tags !== undefined) q.tags = Array.isArray(req.body.tags) ? req.body.tags : []
    q.is_composite = false
    q.sub = []
    q.has_image = detectHasImage(q.question, q.answer || '', q.source_image || '', [])
    await q.save()
    res.json({ success: true, message: '✅ ویرایش شد', data: q })
  } catch (e: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

export const deleteQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = await Question.findById(req.params.id)
    if (!q) { res.status(404).json({ success: false, message: '⚠️ سوال یافت نشد' }); return }
    await q.deleteOne()
    await Book.findByIdAndUpdate(q.book, { $inc: { totalQuestions: -1 } })
    await Grade.findByIdAndUpdate(q.grade, { $inc: { totalQuestions: -1 } })
    await Course.findByIdAndUpdate(q.course, { $inc: { totalQuestions: -1 } })
    res.json({ success: true, message: '✅ حذف شد' })
  } catch (e: any) { res.status(500).json({ success: false, message: '❌ خطا' }) }
}

// ==================== Import ====================
export const importQuestions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { questions, bookId } = req.body
    if (!bookId || !questions || !Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ success: false, message: '⚠️ فرمت نامعتبر' }); return
    }

    const seenKeys = new Map<string, number>()
    const failed: any[] = []
    const toImport: any[] = []

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const originalIndex = q.__originalIndex || (i + 1)
      const sub = q.sub
      
      if (sub && Array.isArray(sub) && sub.length > 0) {
        for (let si = 0; si < sub.length; si++) {
          const s = sub[si]
          const type = normalizeType(s.type)
          if (!type) {
            failed.push({
              index: originalIndex,
              question_id: q.question_id || 'بدون شناسه',
              type: s.type || '(خالی)',
              question: (s.question || '').substring(0, 200),
              fullJson: JSON.stringify(q, null, 2),
              reason: `نوع زیرسوال "${s.type}" نامعتبر است`,
              errorType: 'INVALID_SUB_TYPE',
            })
            continue
          }
          
          const qText = s.question || ''
          const aText = s.answer || ''
          const key = createSeenKey(qText, type, aText)
          
          if (seenKeys.has(key)) {
            const firstIdx = seenKeys.get(key)!
            failed.push({
              index: originalIndex,
              question_id: q.question_id || 'بدون شناسه',
              type,
              question: qText.substring(0, 200),
              fullJson: JSON.stringify(q, null, 2),
              reason: `📄 تکراری در همین فایل JSON (قبلاً در ردیف ${firstIdx} آمده)`,
              errorType: 'DUPLICATE_IN_JSON',
              duplicateInJsonIndex: firstIdx,
              duplicateJson: JSON.stringify(questions[firstIdx - 1], null, 2),
            })
            continue
          }
          
          seenKeys.set(key, originalIndex)
          toImport.push({ ...q, __originalIndex: originalIndex, __subItem: s, __type: type })
        }
      } else {
        const type = normalizeType(q.type)
        if (!type) {
          failed.push({
            index: originalIndex,
            question_id: q.question_id || 'بدون شناسه',
            type: q.type || '(خالی)',
            question: (q.question || '').substring(0, 200),
            fullJson: JSON.stringify(q, null, 2),
            reason: `نوع سوال "${q.type}" نامعتبر است`,
            errorType: 'INVALID_TYPE',
          })
          continue
        }
        
        const qText = normalizeQuestion(q.question, type)
        if (!qText) {
          failed.push({
            index: originalIndex,
            question_id: q.question_id || 'بدون شناسه',
            type,
            question: '(خالی)',
            fullJson: JSON.stringify(q, null, 2),
            reason: 'صورت سوال خالی است',
            errorType: 'EMPTY_QUESTION',
          })
          continue
        }
        
        const aText = q.answer || ''
        const key = createSeenKey(qText, type, aText)
        
        if (seenKeys.has(key)) {
          const firstIdx = seenKeys.get(key)!
          failed.push({
            index: originalIndex,
            question_id: q.question_id || 'بدون شناسه',
            type,
            question: qText.substring(0, 200),
            fullJson: JSON.stringify(q, null, 2),
            reason: `📄 تکراری در همین فایل JSON (قبلاً در ردیف ${firstIdx} آمده)`,
            errorType: 'DUPLICATE_IN_JSON',
            duplicateInJsonIndex: firstIdx,
            duplicateJson: JSON.stringify(questions[firstIdx - 1], null, 2),
          })
          continue
        }
        
        seenKeys.set(key, originalIndex)
        toImport.push({ ...q, __originalIndex: originalIndex, __type: type })
      }
    }

    const book = await Book.findById(bookId).populate('grade')
    if (!book) {
      res.status(404).json({ success: false, message: '⚠️ درس یافت نشد' }); return
    }
    const grade = await Grade.findById(book.grade)

    let success = 0
    const baseData = {
      book: bookId,
      grade: book.grade,
      course: grade?.course,
      createdBy: req.user!._id,
      status: 'در-حال-بررسی',
      tags: [],
    }

    for (const item of toImport) {
      const subItem = item.__subItem
      let type: string
      let questionText: string
      let answerText: string
      let options: string[] = []
      let pageNumbers: number[] = []
      let mainQuestion = ''

      if (subItem) {
        type = item.__type
        questionText = subItem.question || ''
        answerText = subItem.answer || ''
        options = subItem.options || []
        pageNumbers = parsePageNumbers(subItem.page_number || item.page_number)
        mainQuestion = item.question || ''
      } else {
        type = item.__type
        questionText = normalizeQuestion(item.question, type) || item.question || ''
        answerText = item.answer || ''
        options = item.options || []
        pageNumbers = parsePageNumbers(item.page_number)
        mainQuestion = ''
      }

      const dup = await findDuplicateInDB(questionText, type, bookId, answerText)
      if (dup) {
        failed.push({
          index: item.__originalIndex,
          question_id: item.question_id || 'بدون شناسه',
          type,
          question: questionText.substring(0, 200),
          fullJson: JSON.stringify(item, null, 2),
          reason: '🔄 این سوال قبلاً در دیتابیس ثبت شده است',
          errorType: 'DUPLICATE_IN_DB',
          duplicateDbId: dup._id,
          duplicateDbQuestionId: dup.question_id,
        })
        continue
      }

      const hasImage = getHasImageForImport(item, questionText, answerText, item.source_image || '', [])
      
      await Question.create({
        ...baseData,
        question_id: uuidv4(),
        type,
        difficulty: normalizeDifficulty(item.difficulty) || 'متوسط',
        question: questionText,
        mainQuestion,
        options,
        matching_left: item.matching_left || [],
        matching_right: item.matching_right || [],
        answer: answerText,
        lesson_id: item.lesson_id || 1,
        page_number: pageNumbers,
        source_image: item.source_image || '',
        is_composite: false,
        sub: [],
        has_image: hasImage,
      })
      success++
    }

    const count = await Question.countDocuments({ book: bookId, isActive: true })
    await Book.findByIdAndUpdate(bookId, { totalQuestions: count })
    await Grade.findByIdAndUpdate(book.grade, { totalQuestions: await Question.countDocuments({ grade: book.grade, isActive: true }) })
    const g = await Grade.findById(book.grade)
    if (g) await Course.findByIdAndUpdate(g.course, { totalQuestions: await Question.countDocuments({ course: g.course, isActive: true }) })

    failed.sort((a, b) => a.index - b.index)

    logger.info(`✅ ایمپورت: ${success} موفق, ${failed.length} ناموفق`)
    res.json({
      success: true,
      message: `✅ ${success} سوال import شد`,
      data: { success, failed: failed.length, total: questions.length, failedItems: failed },
    })
  } catch (e: any) {
    logger.error('❌ خطا در import:', e.message)
    res.status(500).json({ success: false, message: '❌ خطا در import' })
  }
}
