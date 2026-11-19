import { Request, Response } from 'express'
import crypto from 'crypto'
import {
  EduAuditLog,
  EduBackupSnapshot,
  EduBook,
  EduChapter,
  EduCustomSection,
  EduField,
  EduGrade,
  EduLesson,
  EduLevel,
  EduResource,
  type EduImageStatus,
  type EduImageType,
} from '../../../core/models/EduContent.js'
import { Book as QuestionBook } from '../../../core/models/Book.js'
import { Grade as QuestionGrade } from '../../../core/models/Grade.js'
import { logger } from '../../../core/utils/logger.js'
import {
  applyEduJsonImport,
  createEduBackupSnapshot,
  exportEduContentToJson,
  previewEduJsonImport,
  restoreEduBackupSnapshot,
  type ImportMode,
} from '../services/eduContentImport.service.js'
import {
  deleteUploadedEduMediaIfLocal,
  ensureGraphicForTaxonomy,
} from '../services/eduMedia.service.js'

function getActorName(req: Request): string {
  const u = (req as any).user
  return u?.fullName || `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || u?.username || 'مدیر سیستم'
}

function makeStableId(prefix: string, name: string): string {
  const rand = crypto.randomBytes(3).toString('hex')
  return `${prefix}::${name.trim().replace(/\s+/g, '_')}::${Date.now().toString(36)}${rand}`
}

async function logAudit(
  action: 'create' | 'update' | 'delete' | 'reorder' | 'import' | 'restore' | 'image_update',
  entityType: 'level' | 'grade' | 'field' | 'book' | 'chapter' | 'lesson' | 'system',
  actorName: string,
  summary: string,
  entityStableId?: string,
  details?: any
) {
  await EduAuditLog.create({ action, entityType, entityStableId, actorName, summary, details })
}

function getEntityModel(entityType: string): any {
  switch (entityType) {
    case 'level': return EduLevel
    case 'grade': return EduGrade
    case 'field': return EduField
    case 'book': return EduBook
    default: return null
  }
}

export const getEduStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      levels,
      grades,
      fields,
      books,
      chapterBooks,
      lessonBooks,
      chapters,
      lessons,
      emptyLessonChapters,
      booksNeedImage,
      levelsNeedImage,
      gradesNeedImage,
      backupsCount,
      auditLogsCount,
    ] = await Promise.all([
      EduLevel.countDocuments(),
      EduGrade.countDocuments(),
      EduField.countDocuments(),
      EduBook.countDocuments(),
      EduBook.countDocuments({ structure: 'chapter' }),
      EduBook.countDocuments({ structure: 'lesson' }),
      EduChapter.countDocuments(),
      EduLesson.countDocuments(),
      EduChapter.countDocuments({ hasEmptyLessons: true }),
      EduBook.countDocuments({ 'image.status': 'needs_image' }),
      EduLevel.countDocuments({ 'image.status': 'needs_image' }),
      EduGrade.countDocuments({ 'image.status': 'needs_image' }),
      EduBackupSnapshot.countDocuments(),
      EduAuditLog.countDocuments(),
    ])

    res.status(200).json({
      success: true,
      data: {
        levels,
        grades,
        fields,
        books,
        chapterBooks,
        lessonBooks,
        chapters,
        lessons,
        emptyLessonChapters,
        needsImageCount: booksNeedImage + levelsNeedImage + gradesNeedImage,
        booksNeedImage,
        backupsCount,
        auditLogsCount,
      },
    })
  } catch (error: any) {
    logger.error('getEduStats error:', error)
    res.status(500).json({ success: false, message: 'خطا در دریافت آمار محتوای آموزشی' })
  }
}

export const getEduTree = async (req: Request, res: Response): Promise<void> => {
  try {
    const levelId = typeof req.query.levelId === 'string' ? req.query.levelId.trim() : ''
    const gradeId = typeof req.query.gradeId === 'string' ? req.query.gradeId.trim() : ''
    const fieldId = typeof req.query.fieldId === 'string' ? req.query.fieldId.trim() : ''
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : ''
    const imageStatus = typeof req.query.imageStatus === 'string' ? req.query.imageStatus.trim() : ''
    const structure = typeof req.query.structure === 'string' ? req.query.structure.trim() : ''
    const includeContent = req.query.includeContent === 'true'

    const [levels, grades, fields] = await Promise.all([
      EduLevel.find(levelId ? { _id: levelId } : {}).sort({ order: 1 }).lean(),
      EduGrade.find(levelId ? { levelId } : {}).sort({ order: 1 }).lean(),
      EduField.find(levelId ? { levelId } : {}).sort({ order: 1 }).lean(),
    ])

    const bookFilter: any = {}
    if (levelId) bookFilter.levelId = levelId
    if (gradeId) bookFilter.gradeId = gradeId
    if (fieldId === 'none') bookFilter.fieldId = null
    else if (fieldId) bookFilter.fieldId = fieldId
    if (imageStatus) bookFilter['image.status'] = imageStatus
    if (structure === 'chapter' || structure === 'lesson') bookFilter.structure = structure

    let books = await EduBook.find(bookFilter).sort({ order: 1 }).lean()

    // Also compute chapter & lesson counts per book efficiently via aggregation
    const [chCountsRaw, lsCountsRaw] = await Promise.all([
      EduChapter.aggregate([
        { $group: { _id: '$bookId', count: { $sum: 1 }, emptyLessonsCount: { $sum: { $cond: ['$hasEmptyLessons', 1, 0] } } } },
      ]),
      EduLesson.aggregate([{ $group: { _id: '$bookId', count: { $sum: 1 } } }]),
    ])

    const chCountMap = new Map(chCountsRaw.map((r: any) => [String(r._id), r]))
    const lsCountMap = new Map(lsCountsRaw.map((r: any) => [String(r._id), r.count]))

    // If search query q is present, match across levels, grades, fields, books, chapters, lessons, and keywords
    let matchedBookIdsBySearch: Set<string> | null = null
    let matchingChaptersByBook = new Map<string, any[]>()

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      const [matchingChaps, matchingLessons] = await Promise.all([
        EduChapter.find({ $or: [{ title: regex }, { keywords: regex }, { jsonKey: regex }] })
          .select('bookId title keywords jsonKey')
          .lean(),
        EduLesson.find({ $or: [{ title: regex }, { keywords: regex }, { jsonKey: regex }] })
          .select('bookId chapterId title keywords')
          .lean(),
      ])

      const levelMap = new Map(levels.map((l) => [String(l._id), l]))
      const gradeMap = new Map(grades.map((g) => [String(g._id), g]))
      const fieldMap = new Map(fields.map((f) => [String(f._id), f]))

      matchedBookIdsBySearch = new Set<string>()
      for (const ch of matchingChaps) matchedBookIdsBySearch.add(String(ch.bookId))
      for (const ls of matchingLessons) matchedBookIdsBySearch.add(String(ls.bookId))

      books = books.filter((b) => {
        const lvlName = levelMap.get(String(b.levelId))?.name || ''
        const grdName = gradeMap.get(String(b.gradeId))?.name || ''
        const fldName = b.fieldId ? fieldMap.get(String(b.fieldId))?.name || '' : ''
        const directMatch =
          b.title.toLowerCase().includes(q) ||
          (b.keywords || []).some((k) => k.toLowerCase().includes(q)) ||
          lvlName.toLowerCase().includes(q) ||
          grdName.toLowerCase().includes(q) ||
          fldName.toLowerCase().includes(q)
        return directMatch || matchedBookIdsBySearch!.has(String(b._id))
      })

      for (const ch of matchingChaps) {
        const key = String(ch.bookId)
        const arr = matchingChaptersByBook.get(key) || []
        arr.push(ch)
        matchingChaptersByBook.set(key, arr)
      }
    }

    let chaptersByBook: Record<string, any[]> | undefined
    if (includeContent && books.length > 0 && books.length <= 250) {
      const bookIds = books.map((b) => b._id)
      const [chaps, ls] = await Promise.all([
        EduChapter.find({ bookId: { $in: bookIds } }).sort({ order: 1 }).lean(),
        EduLesson.find({ bookId: { $in: bookIds } }).sort({ order: 1 }).lean(),
      ])
      const lessonsByCh = new Map<string, any[]>()
      for (const item of ls) {
        const key = String(item.chapterId)
        const arr = lessonsByCh.get(key) || []
        arr.push(item)
        lessonsByCh.set(key, arr)
      }
      chaptersByBook = {}
      for (const ch of chaps) {
        const key = String(ch.bookId)
        if (!chaptersByBook[key]) chaptersByBook[key] = []
        chaptersByBook[key].push({ ...ch, lessons: lessonsByCh.get(String(ch._id)) || [] })
      }
    }

    const enrichedBooks = books.map((b) => {
      const cStats = chCountMap.get(String(b._id))
      return {
        ...b,
        chaptersCount: cStats?.count || 0,
        emptyLessonsCount: cStats?.emptyLessonsCount || 0,
        lessonsCount: lsCountMap.get(String(b._id)) || 0,
        matchedChaptersPreview: matchingChaptersByBook.get(String(b._id))?.slice(0, 3),
        ...(chaptersByBook ? { chapters: chaptersByBook[String(b._id)] || [] } : {}),
      }
    })

    res.status(200).json({
      success: true,
      data: { levels, grades, fields, books: enrichedBooks },
    })
  } catch (error: any) {
    logger.error('getEduTree error:', error)
    res.status(500).json({ success: false, message: 'خطا در دریافت ساختار محتوای آموزشی' })
  }
}

export const getBookDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const book = await EduBook.findById(req.params.id)
      .populate('levelId', 'name code')
      .populate('gradeId', 'name numericOrder')
      .populate('fieldId', 'name')
      .lean()

    if (!book) {
      res.status(404).json({ success: false, message: 'کتاب یافت نشد' })
      return
    }

    const [chapters, lessons] = await Promise.all([
      EduChapter.find({ bookId: book._id }).sort({ order: 1 }).lean(),
      EduLesson.find({ bookId: book._id }).sort({ order: 1 }).lean(),
    ])

    const lessonsByCh = new Map<string, any[]>()
    for (const ls of lessons) {
      const k = String(ls.chapterId)
      const arr = lessonsByCh.get(k) || []
      arr.push(ls)
      lessonsByCh.set(k, arr)
    }

    const enrichedChapters = chapters.map((ch) => ({
      ...ch,
      lessons: lessonsByCh.get(String(ch._id)) || [],
    }))

    res.status(200).json({
      success: true,
      data: { ...book, chapters: enrichedChapters },
    })
  } catch (error: any) {
    logger.error('getBookDetail error:', error)
    res.status(500).json({ success: false, message: 'خطا در دریافت جزئیات کتاب' })
  }
}

// ==================== CRUD: Levels, Grades, Fields, Books, Chapters, Lessons ====================

export const createLevel = async (req: Request, res: Response): Promise<void> => {
  try {
    const name = String(req.body.name || '').trim()
    if (!name) {
      res.status(400).json({ success: false, message: 'نام مقطع الزامی است' })
      return
    }
    const order = Number(req.body.order) || (await EduLevel.countDocuments()) + 1
    const stableId = makeStableId('lvl', name)
    const image = ensureGraphicForTaxonomy('level', stableId, name)
    const doc = await EduLevel.create({
      stableId,
      name,
      code: String(req.body.code || '').trim(),
      order,
      isActive: req.body.isActive !== false,
      image,
    })
    await logAudit('create', 'level', getActorName(req), `افزودن مقطع «${name}»`, doc.stableId)
    res.status(201).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در ایجاد مقطع' })
  }
}

export const updateLevel = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduLevel.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'مقطع یافت نشد' }); return }
    if (req.body.name !== undefined) doc.name = String(req.body.name).trim()
    if (req.body.code !== undefined) doc.code = String(req.body.code).trim()
    if (req.body.order !== undefined) doc.order = Number(req.body.order)
    if (req.body.isActive !== undefined) doc.isActive = Boolean(req.body.isActive)
    await doc.save()
    await logAudit('update', 'level', getActorName(req), `ویرایش مقطع «${doc.name}»`, doc.stableId)
    res.status(200).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const deleteLevel = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduLevel.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'مقطع یافت نشد' }); return }
    const childBooks = await EduBook.countDocuments({ levelId: doc._id })
    if (childBooks > 0 && req.query.confirm !== 'true') {
      res.status(400).json({
        success: false,
        requiresConfirmation: true,
        message: `این مقطع دارای ${childBooks} کتاب است. برای حذف کامل باید تایید شود.`,
      })
      return
    }
    if (childBooks > 0) {
      await createEduBackupSnapshot(`بکاپ خودکار پیش از حذف مقطع ${doc.name}`, 'pre_mass_delete', getActorName(req))
    }
    const bookIds = (await EduBook.find({ levelId: doc._id }).select('_id').lean()).map((b) => b._id)
    await Promise.all([
      EduLesson.deleteMany({ bookId: { $in: bookIds } }),
      EduChapter.deleteMany({ bookId: { $in: bookIds } }),
      EduBook.deleteMany({ levelId: doc._id }),
      EduGrade.deleteMany({ levelId: doc._id }),
      EduField.deleteMany({ levelId: doc._id }),
      EduLevel.deleteOne({ _id: doc._id }),
    ])
    await logAudit('delete', 'level', getActorName(req), `حذف مقطع «${doc.name}»`, doc.stableId)
    res.status(200).json({ success: true, message: 'مقطع با موفقیت حذف شد' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createGrade = async (req: Request, res: Response): Promise<void> => {
  try {
    const name = String(req.body.name || '').trim()
    const levelId = req.body.levelId
    if (!name || !levelId) {
      res.status(400).json({ success: false, message: 'نام پایه و مقطع الزامی است' })
      return
    }
    const level = await EduLevel.findById(levelId)
    if (!level) { res.status(404).json({ success: false, message: 'مقطع یافت نشد' }); return }
    const order = Number(req.body.order) || (await EduGrade.countDocuments({ levelId })) + 1
    const numericOrder = Number(req.body.numericOrder) || order
    const stableId = makeStableId('grd', `${level.name}_${name}`)
    const image = ensureGraphicForTaxonomy('grade', stableId, `پایه ${name}`, level.name)
    const doc = await EduGrade.create({
      stableId,
      name,
      levelId,
      numericOrder,
      order,
      isActive: req.body.isActive !== false,
      image,
    })
    await logAudit('create', 'grade', getActorName(req), `افزودن پایه «${name}»`, doc.stableId)
    res.status(201).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateGrade = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduGrade.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'پایه یافت نشد' }); return }
    if (req.body.name !== undefined) doc.name = String(req.body.name).trim()
    if (req.body.numericOrder !== undefined) doc.numericOrder = Number(req.body.numericOrder)
    if (req.body.order !== undefined) doc.order = Number(req.body.order)
    if (req.body.levelId !== undefined) doc.levelId = req.body.levelId
    if (req.body.isActive !== undefined) doc.isActive = Boolean(req.body.isActive)
    await doc.save()
    await logAudit('update', 'grade', getActorName(req), `ویرایش پایه «${doc.name}»`, doc.stableId)
    res.status(200).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const deleteGrade = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduGrade.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'پایه یافت نشد' }); return }
    const childBooks = await EduBook.countDocuments({ gradeId: doc._id })
    if (childBooks > 0 && req.query.confirm !== 'true') {
      res.status(400).json({
        success: false,
        requiresConfirmation: true,
        message: `این پایه دارای ${childBooks} کتاب است. آیا از حذف مطمئن هستید؟`,
      })
      return
    }
    const bookIds = (await EduBook.find({ gradeId: doc._id }).select('_id').lean()).map((b) => b._id)
    await Promise.all([
      EduLesson.deleteMany({ bookId: { $in: bookIds } }),
      EduChapter.deleteMany({ bookId: { $in: bookIds } }),
      EduBook.deleteMany({ gradeId: doc._id }),
      EduGrade.deleteOne({ _id: doc._id }),
    ])
    await logAudit('delete', 'grade', getActorName(req), `حذف پایه «${doc.name}»`, doc.stableId)
    res.status(200).json({ success: true, message: 'پایه حذف شد' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createField = async (req: Request, res: Response): Promise<void> => {
  try {
    const name = String(req.body.name || '').trim()
    const levelId = req.body.levelId
    if (!name || !levelId) {
      res.status(400).json({ success: false, message: 'نام رشته و مقطع الزامی است' })
      return
    }
    const order = Number(req.body.order) || (await EduField.countDocuments({ levelId })) + 1
    const stableId = makeStableId('fld', name)
    const image = ensureGraphicForTaxonomy('field', stableId, `رشته ${name}`)
    const doc = await EduField.create({
      stableId,
      name,
      levelId,
      order,
      isActive: req.body.isActive !== false,
      image,
    })
    await logAudit('create', 'field', getActorName(req), `افزودن رشته «${name}»`, doc.stableId)
    res.status(201).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateField = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduField.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'رشته یافت نشد' }); return }
    if (req.body.name !== undefined) doc.name = String(req.body.name).trim()
    if (req.body.order !== undefined) doc.order = Number(req.body.order)
    if (req.body.isActive !== undefined) doc.isActive = Boolean(req.body.isActive)
    await doc.save()
    await logAudit('update', 'field', getActorName(req), `ویرایش رشته «${doc.name}»`, doc.stableId)
    res.status(200).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const deleteField = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduField.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'رشته یافت نشد' }); return }
    const childBooks = await EduBook.countDocuments({ fieldId: doc._id })
    if (childBooks > 0 && req.query.confirm !== 'true') {
      res.status(400).json({
        success: false,
        requiresConfirmation: true,
        message: `این رشته دارای ${childBooks} کتاب است. آیا از حذف مطمئن هستید؟`,
      })
      return
    }
    const bookIds = (await EduBook.find({ fieldId: doc._id }).select('_id').lean()).map((b) => b._id)
    await Promise.all([
      EduLesson.deleteMany({ bookId: { $in: bookIds } }),
      EduChapter.deleteMany({ bookId: { $in: bookIds } }),
      EduBook.deleteMany({ fieldId: doc._id }),
      EduField.deleteOne({ _id: doc._id }),
    ])
    await logAudit('delete', 'field', getActorName(req), `حذف رشته «${doc.name}»`, doc.stableId)
    res.status(200).json({ success: true, message: 'رشته حذف شد' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createBook = async (req: Request, res: Response): Promise<void> => {
  try {
    const title = String(req.body.title || '').trim()
    const { levelId, gradeId, fieldId, structure = 'chapter', keywords = [] } = req.body
    if (!title || !levelId || !gradeId) {
      res.status(400).json({ success: false, message: 'عنوان کتاب، مقطع و پایه الزامی هستند' })
      return
    }
    const order = Number(req.body.order) || (await EduBook.countDocuments({ gradeId, fieldId: fieldId || null })) + 1
    const stableId = makeStableId('bk', title)
    const doc = await EduBook.create({
      stableId,
      title,
      levelId,
      gradeId,
      fieldId: fieldId || null,
      structure: structure === 'lesson' ? 'lesson' : 'chapter',
      keywords: Array.isArray(keywords) ? keywords.map((k: string) => String(k).trim()).filter(Boolean) : [],
      order,
      isActive: req.body.isActive !== false,
      image: { url: null, imageType: 'none', source: 'none', status: 'needs_image' },
    })
    await logAudit('create', 'book', getActorName(req), `افزودن کتاب «${title}»`, doc.stableId)
    res.status(201).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateBook = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduBook.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'کتاب یافت نشد' }); return }
    if (req.body.title !== undefined) doc.title = String(req.body.title).trim()
    if (req.body.levelId !== undefined) doc.levelId = req.body.levelId
    if (req.body.gradeId !== undefined) doc.gradeId = req.body.gradeId
    if (req.body.fieldId !== undefined) doc.fieldId = req.body.fieldId || null
    if (req.body.linkedQuestionBookId !== undefined) doc.linkedQuestionBookId = req.body.linkedQuestionBookId || null
    if (req.body.structure === 'chapter' || req.body.structure === 'lesson') doc.structure = req.body.structure
    if (Array.isArray(req.body.keywords)) {
      doc.keywords = req.body.keywords.map((k: string) => String(k).trim()).filter(Boolean)
    }
    if (req.body.order !== undefined) doc.order = Number(req.body.order)
    if (req.body.isActive !== undefined) doc.isActive = Boolean(req.body.isActive)
    await doc.save()
    await logAudit('update', 'book', getActorName(req), `ویرایش کتاب «${doc.title}»`, doc.stableId)
    res.status(200).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const deleteBook = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduBook.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'کتاب یافت نشد' }); return }
    const childChaps = await EduChapter.countDocuments({ bookId: doc._id })
    if (childChaps > 0 && req.query.confirm !== 'true') {
      res.status(400).json({
        success: false,
        requiresConfirmation: true,
        message: `این کتاب دارای ${childChaps} فصل/بخش است. برای حذف تایید کنید.`,
      })
      return
    }
    await Promise.all([
      EduLesson.deleteMany({ bookId: doc._id }),
      EduChapter.deleteMany({ bookId: doc._id }),
      EduBook.deleteOne({ _id: doc._id }),
    ])
    await logAudit('delete', 'book', getActorName(req), `حذف کتاب «${doc.title}»`, doc.stableId)
    res.status(200).json({ success: true, message: 'کتاب حذف شد' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createChapter = async (req: Request, res: Response): Promise<void> => {
  try {
    const book = await EduBook.findById(req.params.bookId)
    if (!book) { res.status(404).json({ success: false, message: 'کتاب یافت نشد' }); return }
    const title = String(req.body.title || '').trim()
    if (!title) { res.status(400).json({ success: false, message: 'عنوان فصل/بخش الزامی است' }); return }
    const jsonKey = String(req.body.jsonKey || title).trim()
    const order = Number(req.body.order) || (await EduChapter.countDocuments({ bookId: book._id })) + 1
    const keywords = Array.isArray(req.body.keywords)
      ? req.body.keywords.map((k: string) => String(k).trim()).filter(Boolean)
      : []

    const doc = await EduChapter.create({
      stableId: makeStableId(`${book.stableId}::ch`, jsonKey),
      bookId: book._id,
      jsonKey,
      title,
      keywords,
      hasEmptyLessons: true,
      order,
      isActive: req.body.isActive !== false,
    })
    await logAudit('create', 'chapter', getActorName(req), `افزودن فصل/بخش «${title}» در «${book.title}»`, doc.stableId)
    res.status(201).json({ success: true, data: { ...doc.toObject(), lessons: [] } })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateChapter = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduChapter.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'فصل/بخش یافت نشد' }); return }
    if (req.body.title !== undefined) doc.title = String(req.body.title).trim()
    if (req.body.jsonKey !== undefined) doc.jsonKey = String(req.body.jsonKey).trim()
    if (Array.isArray(req.body.keywords)) {
      doc.keywords = req.body.keywords.map((k: string) => String(k).trim()).filter(Boolean)
    }
    if (req.body.order !== undefined) doc.order = Number(req.body.order)
    if (req.body.isActive !== undefined) doc.isActive = Boolean(req.body.isActive)
    await doc.save()
    await logAudit('update', 'chapter', getActorName(req), `ویرایش فصل/بخش «${doc.title}»`, doc.stableId)
    res.status(200).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const deleteChapter = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduChapter.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'فصل یافت نشد' }); return }
    await Promise.all([
      EduLesson.deleteMany({ chapterId: doc._id }),
      EduChapter.deleteOne({ _id: doc._id }),
    ])
    await logAudit('delete', 'chapter', getActorName(req), `حذف فصل «${doc.title}»`, doc.stableId)
    res.status(200).json({ success: true, message: 'فصل حذف شد' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const reorderChapters = async (req: Request, res: Response): Promise<void> => {
  try {
    const ids: string[] = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : []
    await Promise.all(
      ids.map((id, idx) => EduChapter.updateOne({ _id: id, bookId: req.params.bookId }, { $set: { order: idx + 1 } }))
    )
    await logAudit('reorder', 'chapter', getActorName(req), 'تغییر ترتیب فصل‌های کتاب', String(req.params.bookId))
    res.status(200).json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createLesson = async (req: Request, res: Response): Promise<void> => {
  try {
    const chapter = await EduChapter.findById(req.params.chapterId)
    if (!chapter) { res.status(404).json({ success: false, message: 'فصل یافت نشد' }); return }
    const title = String(req.body.title || '').trim()
    if (!title) { res.status(400).json({ success: false, message: 'عنوان درس الزامی است' }); return }
    const jsonKey = String(req.body.jsonKey || title).trim()
    const order = Number(req.body.order) || (await EduLesson.countDocuments({ chapterId: chapter._id })) + 1
    const keywords = Array.isArray(req.body.keywords)
      ? req.body.keywords.map((k: string) => String(k).trim()).filter(Boolean)
      : []

    const doc = await EduLesson.create({
      stableId: makeStableId(`${chapter.stableId}::ls`, jsonKey),
      bookId: chapter.bookId,
      chapterId: chapter._id,
      jsonKey,
      title,
      keywords,
      order,
      isActive: req.body.isActive !== false,
    })
    if (chapter.hasEmptyLessons) {
      chapter.hasEmptyLessons = false
      await chapter.save()
    }
    await logAudit('create', 'lesson', getActorName(req), `افزودن درس «${title}» در «${chapter.title}»`, doc.stableId)
    res.status(201).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateLesson = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduLesson.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'درس یافت نشد' }); return }
    if (req.body.title !== undefined) doc.title = String(req.body.title).trim()
    if (req.body.jsonKey !== undefined) doc.jsonKey = String(req.body.jsonKey).trim()
    if (Array.isArray(req.body.keywords)) {
      doc.keywords = req.body.keywords.map((k: string) => String(k).trim()).filter(Boolean)
    }
    if (req.body.order !== undefined) doc.order = Number(req.body.order)
    if (req.body.isActive !== undefined) doc.isActive = Boolean(req.body.isActive)
    await doc.save()
    await logAudit('update', 'lesson', getActorName(req), `ویرایش درس «${doc.title}»`, doc.stableId)
    res.status(200).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const deleteLesson = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduLesson.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'درس یافت نشد' }); return }
    await EduLesson.deleteOne({ _id: doc._id })
    const remaining = await EduLesson.countDocuments({ chapterId: doc.chapterId })
    if (remaining === 0) {
      await EduChapter.updateOne({ _id: doc.chapterId }, { $set: { hasEmptyLessons: true } })
    }
    await logAudit('delete', 'lesson', getActorName(req), `حذف درس «${doc.title}»`, doc.stableId)
    res.status(200).json({ success: true, message: 'درس حذف شد' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const reorderEntities = async (req: Request, res: Response): Promise<void> => {
  try {
    const { entityType } = req.params
    const ids: string[] = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : []
    const Model =
      entityType === 'level' ? EduLevel
      : entityType === 'grade' ? EduGrade
      : entityType === 'field' ? EduField
      : entityType === 'book' ? EduBook
      : entityType === 'chapter' ? EduChapter
      : entityType === 'lesson' ? EduLesson
      : null

    if (!Model) { res.status(400).json({ success: false, message: 'نوع موجودیت نامعتبر است' }); return }
    await Promise.all(ids.map((id, idx) => (Model as any).updateOne({ _id: id }, { $set: { order: idx + 1 } })))
    await logAudit('reorder', entityType as any, getActorName(req), `مرتب‌سازی ${entityType}`)
    res.status(200).json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// ==================== Import / Export / Backup ====================

function extractJsonPayload(req: Request): unknown {
  if (req.file?.buffer) {
    return JSON.parse(req.file.buffer.toString('utf-8'))
  }
  if (typeof req.body.payload === 'string') {
    return JSON.parse(req.body.payload)
  }
  return req.body.payload ?? req.body
}

export const previewJsonImport = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = extractJsonPayload(req)
    const preview = await previewEduJsonImport(payload)
    res.status(200).json({
      success: preview.parsed.valid,
      message: preview.parsed.valid ? 'فایل JSON بررسی و آماده پیش‌نمایش است' : preview.parsed.errors[0],
      data: {
        valid: preview.parsed.valid,
        errors: preview.parsed.errors,
        warnings: preview.parsed.warnings,
        duplicatesInFile: preview.parsed.duplicatesInFile,
        incompleteItems: preview.parsed.incompleteItems.slice(0, 50),
        incompleteItemsCount: preview.parsed.incompleteItems.length,
        summary: preview.parsed.summary,
        diff: preview.diff,
      },
    })
  } catch (error: any) {
    res.status(400).json({ success: false, message: `خطا در خواندن JSON: ${error.message}` })
  }
}

export const applyJsonImport = async (req: Request, res: Response): Promise<void> => {
  try {
    const mode = (req.body.mode || 'merge') as ImportMode
    if (!['add_new', 'update_existing', 'merge', 'replace_all'].includes(mode)) {
      res.status(400).json({ success: false, message: 'حالت ورود نامعتبر است' })
      return
    }
    if (mode === 'replace_all' && req.body.confirmReplace !== true && req.body.confirmReplace !== 'true') {
      res.status(400).json({
        success: false,
        requiresConfirmation: true,
        message: 'برای جایگزینی کامل باید تایید مدیر ارسال شود.',
      })
      return
    }
    const payload = extractJsonPayload(req)
    const result = await applyEduJsonImport(payload, mode, getActorName(req))
    res.status(200).json({
      success: true,
      message: 'عملیات ورود اطلاعات با موفقیت انجام شد',
      data: result,
    })
  } catch (error: any) {
    logger.error('applyJsonImport error:', error)
    res.status(400).json({ success: false, message: error.message || 'خطا در ورود اطلاعات JSON' })
  }
}

export const exportJson = async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = (req.query.scope as any) || 'all'
    const id = typeof req.query.id === 'string' ? req.query.id : undefined
    const chapterIdsRaw = typeof req.query.chapterIds === 'string' ? req.query.chapterIds : ''
    const chapterIds = chapterIdsRaw ? chapterIdsRaw.split(',').filter(Boolean) : undefined
    const includeStableIds = req.query.includeStableIds !== 'false'

    const data = await exportEduContentToJson({ scope, id, chapterIds, includeStableIds })
    if (req.query.download === '1') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="nokita-edu-${scope}-${Date.now()}.json"`)
      res.status(200).send(JSON.stringify(data, null, 2))
      return
    }
    res.status(200).json({ success: true, count: data.length, data })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const listBackups = async (_req: Request, res: Response): Promise<void> => {
  try {
    const backups = await EduBackupSnapshot.find()
      .select('-payload')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean()
    res.status(200).json({ success: true, data: backups })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createManualBackup = async (req: Request, res: Response): Promise<void> => {
  try {
    const label =
      String(req.body.label || '').trim() ||
      `پشتیبان دستی (${new Date().toLocaleDateString('fa-IR')})`
    const snap = await createEduBackupSnapshot(label, 'manual', getActorName(req))
    res.status(201).json({
      success: true,
      data: { _id: snap._id, label: snap.label, stats: snap.stats, createdAt: snap.createdAt },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const restoreBackup = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await restoreEduBackupSnapshot(String(req.params.id), getActorName(req))
    res.status(200).json({ success: true, message: 'نسخه پشتیبان با موفقیت بازگردانی شد', data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
}

export const deleteBackup = async (req: Request, res: Response): Promise<void> => {
  try {
    await EduBackupSnapshot.deleteOne({ _id: req.params.id })
    res.status(200).json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// ==================== Media / Images ====================

export const uploadEntityMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    const entityType = String(req.params.entityType)
    const id = String(req.params.id)
    const Model = getEntityModel(entityType)
    if (!Model) { res.status(400).json({ success: false, message: 'نوع موجودیت نامعتبر است' }); return }
    const doc = await Model.findById(id)
    if (!doc) { res.status(404).json({ success: false, message: 'رکورد یافت نشد' }); return }
    if (!req.file) { res.status(400).json({ success: false, message: 'فایل تصویر ارسال نشده است' }); return }

    if (doc.image?.url && doc.image.source === 'admin_upload') {
      deleteUploadedEduMediaIfLocal(doc.image.url)
    }

    const imageType: EduImageType = ['real_cover', 'graphic', 'placeholder'].includes(req.body.imageType)
      ? req.body.imageType
      : entityType === 'book'
        ? 'real_cover'
        : 'graphic'
    const status: EduImageStatus = ['approved', 'pending', 'needs_image'].includes(req.body.status)
      ? req.body.status
      : 'approved'

    doc.image = {
      url: `/uploads/edu-media/${req.file.filename}`,
      imageType,
      source: String(req.body.source || 'admin_upload').trim(),
      status,
      updatedAt: new Date(),
    }
    await doc.save()
    await logAudit('image_update', entityType as any, getActorName(req), `به‌روزرسانی تصویر «${doc.name || doc.title}»`, doc.stableId)
    res.status(200).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const removeEntityMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    const entityType = String(req.params.entityType)
    const id = String(req.params.id)
    const Model = getEntityModel(entityType)
    if (!Model) { res.status(400).json({ success: false, message: 'نوع موجودیت نامعتبر است' }); return }
    const doc = await Model.findById(id)
    if (!doc) { res.status(404).json({ success: false, message: 'رکورد یافت نشد' }); return }
    if (doc.image?.url && doc.image.source === 'admin_upload') {
      deleteUploadedEduMediaIfLocal(doc.image.url)
    }
    doc.image = { url: null, imageType: 'none', source: 'none', status: 'needs_image', updatedAt: new Date() }
    await doc.save()
    await logAudit('image_update', entityType as any, getActorName(req), `حذف تصویر «${doc.name || doc.title}»`, doc.stableId)
    res.status(200).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 40))
    const logs = await EduAuditLog.find().sort({ createdAt: -1 }).limit(limit).lean()
    res.status(200).json({ success: true, data: logs })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// ==================== Question Bank Links, Custom Sections & Resources ====================

export const listQuestionBankBooks = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [books, grades] = await Promise.all([
      QuestionBook.find({ isActive: true }).sort({ order: 1, name: 1 }).lean(),
      QuestionGrade.find({ isActive: true }).select('name').lean(),
    ])
    const gradeMap = new Map(grades.map((g) => [String(g._id), g.name]))
    const data = books.map((b) => ({
      _id: b._id,
      name: b.name,
      gradeName: gradeMap.get(String(b.grade)) || '',
      totalQuestions: b.totalQuestions || 0,
    }))
    res.status(200).json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const listCustomSections = async (req: Request, res: Response): Promise<void> => {
  try {
    const query: any = {}
    if (typeof req.query.levelId === 'string' && req.query.levelId) query.levelId = req.query.levelId
    if (typeof req.query.gradeId === 'string' && req.query.gradeId) query.gradeId = req.query.gradeId
    if (typeof req.query.bookId === 'string' && req.query.bookId) query.bookId = req.query.bookId
    const data = await EduCustomSection.find(query)
      .populate('levelId', 'name')
      .populate('gradeId', 'name')
      .populate('fieldId', 'name')
      .populate('bookId', 'title')
      .sort({ order: 1, createdAt: 1 })
      .lean()
    res.status(200).json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createCustomSection = async (req: Request, res: Response): Promise<void> => {
  try {
    const title = String(req.body.title || '').trim()
    const levelId = req.body.levelId
    if (!title || !levelId) {
      res.status(400).json({ success: false, message: 'عنوان بخش کاستوم و مقطع الزامی است' })
      return
    }
    const order = Number(req.body.order) || (await EduCustomSection.countDocuments({ levelId })) + 1
    const doc = await EduCustomSection.create({
      title,
      description: String(req.body.description || '').trim(),
      icon: String(req.body.icon || 'sparkles').trim(),
      levelId,
      gradeId: req.body.gradeId || null,
      fieldId: req.body.fieldId || null,
      bookId: req.body.bookId || null,
      order,
      isActive: req.body.isActive !== false,
    })
    await logAudit('create', 'system', getActorName(req), `ایجاد بخش سفارشی «${title}»`)
    res.status(201).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateCustomSection = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduCustomSection.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'بخش کاستوم یافت نشد' }); return }
    if (req.body.title !== undefined) doc.title = String(req.body.title).trim()
    if (req.body.description !== undefined) doc.description = String(req.body.description).trim()
    if (req.body.icon !== undefined) doc.icon = String(req.body.icon).trim()
    if (req.body.levelId !== undefined) doc.levelId = req.body.levelId
    if (req.body.gradeId !== undefined) doc.gradeId = req.body.gradeId || null
    if (req.body.fieldId !== undefined) doc.fieldId = req.body.fieldId || null
    if (req.body.bookId !== undefined) doc.bookId = req.body.bookId || null
    if (req.body.order !== undefined) doc.order = Number(req.body.order)
    if (req.body.isActive !== undefined) doc.isActive = Boolean(req.body.isActive)
    await doc.save()
    res.status(200).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const deleteCustomSection = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id
    await EduResource.deleteMany({ customSectionId: id })
    await EduCustomSection.findByIdAndDelete(id)
    await logAudit('delete', 'system', getActorName(req), 'حذف بخش سفارشی و مطالب آن')
    res.status(200).json({ success: true, message: 'بخش سفارشی حذف شد' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const listEduResources = async (req: Request, res: Response): Promise<void> => {
  try {
    const query: any = {}
    if (typeof req.query.levelId === 'string' && req.query.levelId) query.levelId = req.query.levelId
    if (typeof req.query.gradeId === 'string' && req.query.gradeId) query.gradeId = req.query.gradeId
    if (typeof req.query.bookId === 'string' && req.query.bookId) query.bookId = req.query.bookId
    if (typeof req.query.category === 'string' && req.query.category) query.category = req.query.category
    if (typeof req.query.customSectionId === 'string' && req.query.customSectionId) query.customSectionId = req.query.customSectionId

    const data = await EduResource.find(query)
      .populate('bookId', 'title')
      .populate('chapterId', 'title')
      .populate('lessonId', 'title')
      .populate('customSectionId', 'title icon')
      .sort({ order: 1, createdAt: -1 })
      .lean()
    res.status(200).json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createEduResource = async (req: Request, res: Response): Promise<void> => {
  try {
    const category = String(req.body.category || '')
    const contentType = String(req.body.contentType || 'pdf')
    const title = String(req.body.title || '').trim()
    const levelId = req.body.levelId
    if (!title || !levelId || !['main_pdf', 'step_by_step', 'note', 'video', 'custom'].includes(category)) {
      res.status(400).json({ success: false, message: 'عنوان، مقطع و نوع بخش الزامی است' })
      return
    }
    if (category === 'custom' && !req.body.customSectionId) {
      res.status(400).json({ success: false, message: 'برای مطلب کاستوم باید بخش سفارشی انتخاب شود' })
      return
    }

    const file = req.file
    const fileUrl = file
      ? `/uploads/edu-resources/${file.filename}`
      : req.body.fileUrl
        ? String(req.body.fileUrl).trim()
        : null

    const doc = await EduResource.create({
      category,
      customSectionId: req.body.customSectionId || null,
      contentType,
      levelId,
      gradeId: req.body.gradeId || null,
      fieldId: req.body.fieldId || null,
      bookId: req.body.bookId || null,
      chapterId: req.body.chapterId || null,
      lessonId: req.body.lessonId || null,
      title,
      description: String(req.body.description || '').trim(),
      fileUrl,
      textContent: String(req.body.textContent || ''),
      fileSizeBytes: file ? file.size : Number(req.body.fileSizeBytes) || 0,
      durationSeconds: Number(req.body.durationSeconds) || 0,
      order: Number(req.body.order) || 0,
      isActive: req.body.isActive !== 'false' && req.body.isActive !== false,
    })

    await logAudit('create', 'book', getActorName(req), `افزودن منبع «${title}» (${category})`)
    res.status(201).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در ثبت منبع آموزشی' })
  }
}

export const updateEduResource = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduResource.findById(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'منبع یافت نشد' }); return }
    if (req.body.title !== undefined) doc.title = String(req.body.title).trim()
    if (req.body.description !== undefined) doc.description = String(req.body.description).trim()
    if (req.body.textContent !== undefined) doc.textContent = String(req.body.textContent)
    if (req.body.fileUrl !== undefined) doc.fileUrl = req.body.fileUrl || null
    if (req.body.chapterId !== undefined) doc.chapterId = req.body.chapterId || null
    if (req.body.lessonId !== undefined) doc.lessonId = req.body.lessonId || null
    if (req.body.durationSeconds !== undefined) doc.durationSeconds = Number(req.body.durationSeconds) || 0
    if (req.body.order !== undefined) doc.order = Number(req.body.order) || 0
    if (req.body.isActive !== undefined) doc.isActive = Boolean(req.body.isActive)
    if (req.file) {
      doc.fileUrl = `/uploads/edu-resources/${req.file.filename}`
      doc.fileSizeBytes = req.file.size
    }
    await doc.save()
    res.status(200).json({ success: true, data: doc })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const deleteEduResource = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await EduResource.findByIdAndDelete(req.params.id)
    if (!doc) { res.status(404).json({ success: false, message: 'منبع یافت نشد' }); return }
    if (doc.fileUrl && doc.fileUrl.startsWith('/uploads/edu-')) {
      deleteUploadedEduMediaIfLocal(doc.fileUrl)
    }
    await logAudit('delete', 'book', getActorName(req), `حذف منبع «${doc.title}»`)
    res.status(200).json({ success: true, message: 'منبع حذف شد' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}
