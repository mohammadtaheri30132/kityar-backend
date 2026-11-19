import { Request, Response } from 'express'
import {
  EduBook,
  EduChapter,
  EduCustomSection,
  EduField,
  EduGrade,
  EduLesson,
  EduLevel,
  EduResource,
} from '../../../core/models/EduContent.js'
import '../../../core/models/Grade.js'
import { Book as QuestionBook } from '../../../core/models/Book.js'
import { Question } from '../../../core/models/Question.js'
import { StudentProfile } from '../../../core/models/StudentProfile.js'
import { logger } from '../../../core/utils/logger.js'

const PERSIAN_ORDINALS = ['', 'اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم']

function normalizePersianTitle(text: string): string {
  return String(text || '')
    .replace(/[\u200c\s]+/g, ' ')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[۰-۹0-9]/g, '')
    .trim()
}

function stripQuestionHtml(html: string): string {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&zwnj;/gi, '\u200c')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
}

async function resolveQuestionBankBookIds(eduBook: any) {
  if (eduBook.linkedQuestionBookId) {
    return [eduBook.linkedQuestionBookId]
  }
  const gradeDoc = eduBook.gradeId && typeof eduBook.gradeId === 'object' ? eduBook.gradeId : null
  const num = Number(gradeDoc?.numericOrder || 0)
  const gradeOrd = PERSIAN_ORDINALS[num] || (typeof gradeDoc?.name === 'string' ? gradeDoc.name.trim() : '')
  const eduTitleNorm = normalizePersianTitle(eduBook.title).replace(/[()\-]/g, '').trim()
  if (!eduTitleNorm) return []

  const allQBooks = await QuestionBook.find({ isActive: true }).populate('grade', 'name').lean()
  const firstWord = eduTitleNorm.split(' ')[0]

  const matched = allQBooks.filter((qb: any) => {
    const gName = normalizePersianTitle(String(qb.grade?.name || ''))
    const qbTitleNorm = normalizePersianTitle(qb.name).replace(/[()\-]/g, '').trim()
    const gradeMatch =
      !num ||
      gName.includes(String(num)) ||
      (Boolean(gradeOrd) && (gName.includes(gradeOrd) || qbTitleNorm.includes(gradeOrd)))
    const titleMatch =
      qbTitleNorm === eduTitleNorm ||
      qbTitleNorm.includes(eduTitleNorm) ||
      eduTitleNorm.includes(qbTitleNorm) ||
      (firstWord.length >= 3 && qbTitleNorm.includes(firstWord))
    return gradeMatch && titleMatch
  })

  return matched.map((m) => m._id)
}

const SUBJECT_PALETTE = ['#10B981', '#FF6B00', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6', '#06B6D4']

function mapFieldSlugToPersian(slug?: string): string | null {
  if (!slug || slug === 'general') return null
  if (slug === 'math') return 'ریاضی'
  if (slug === 'experimental') return 'تجربی'
  if (slug === 'humanities') return 'انسانی'
  return slug
}

async function getOptionalStudentProfile(req: Request) {
  const user = (req as any).user
  if (!user?._id) return null
  return StudentProfile.findOne({ user: user._id })
}

export const getStudentEduLevels = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [levels, grades, fields, books] = await Promise.all([
      EduLevel.find({ isActive: true }).sort({ order: 1 }).lean(),
      EduGrade.find({ isActive: true }).sort({ order: 1 }).lean(),
      EduField.find({ isActive: true }).sort({ order: 1 }).lean(),
      EduBook.find({ isActive: true }).select('levelId').lean(),
    ])

    const gradeCount = new Map<string, number>()
    for (const g of grades) gradeCount.set(String(g.levelId), (gradeCount.get(String(g.levelId)) || 0) + 1)

    const fieldCount = new Map<string, number>()
    for (const f of fields) fieldCount.set(String(f.levelId), (fieldCount.get(String(f.levelId)) || 0) + 1)

    const bookCount = new Map<string, number>()
    for (const b of books) bookCount.set(String(b.levelId), (bookCount.get(String(b.levelId)) || 0) + 1)

    const data = levels.map((lvl) => ({
      ...lvl,
      gradesCount: gradeCount.get(String(lvl._id)) || 0,
      fieldsCount: fieldCount.get(String(lvl._id)) || 0,
      booksCount: bookCount.get(String(lvl._id)) || 0,
    }))

    res.status(200).json({ success: true, data })
  } catch (error: any) {
    logger.error('getStudentEduLevels error:', error)
    res.status(500).json({ success: false, message: 'خطا در دریافت مقاطع تحصیلی' })
  }
}

export const getStudentGradesAndFields = async (req: Request, res: Response): Promise<void> => {
  try {
    const levelId = String(req.params.levelId)
    const [level, grades, fields, books] = await Promise.all([
      EduLevel.findOne({ _id: levelId, isActive: true }).lean(),
      EduGrade.find({ levelId, isActive: true }).sort({ order: 1 }).lean(),
      EduField.find({ levelId, isActive: true }).sort({ order: 1 }).lean(),
      EduBook.find({ levelId, isActive: true }).select('gradeId fieldId').lean(),
    ])

    if (!level) {
      res.status(404).json({ success: false, message: 'مقطع یافت نشد یا غیرفعال است' })
      return
    }

    const gradeBookCount = new Map<string, number>()
    for (const b of books) gradeBookCount.set(String(b.gradeId), (gradeBookCount.get(String(b.gradeId)) || 0) + 1)

    res.status(200).json({
      success: true,
      data: {
        level,
        grades: grades.map((g) => ({ ...g, booksCount: gradeBookCount.get(String(g._id)) || 0 })),
        fields,
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در دریافت پایه‌ها و رشته‌ها' })
  }
}

export const getStudentBooks = async (req: Request, res: Response): Promise<void> => {
  try {
    const levelId = typeof req.query.levelId === 'string' ? req.query.levelId : ''
    const gradeId = typeof req.query.gradeId === 'string' ? req.query.gradeId : ''
    const fieldId = typeof req.query.fieldId === 'string' ? req.query.fieldId : ''
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''

    const filter: any = { isActive: true }
    if (levelId) filter.levelId = levelId
    if (gradeId) filter.gradeId = gradeId
    if (fieldId === 'none') filter.fieldId = null
    else if (fieldId) filter.fieldId = fieldId

    const [books, profile] = await Promise.all([
      EduBook.find(filter)
        .populate('levelId', 'name')
        .populate('gradeId', 'name numericOrder')
        .populate('fieldId', 'name')
        .sort({ order: 1 })
        .lean(),
      getOptionalStudentProfile(req),
    ])

    let filtered = books
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      const bookIds = books.map((b) => b._id)
      const [mCh, mLs] = await Promise.all([
        EduChapter.find({ bookId: { $in: bookIds }, isActive: true, $or: [{ title: regex }, { keywords: regex }] })
          .select('bookId')
          .lean(),
        EduLesson.find({ bookId: { $in: bookIds }, isActive: true, $or: [{ title: regex }, { keywords: regex }] })
          .select('bookId')
          .lean(),
      ])
      const matchIds = new Set([...mCh.map((c) => String(c.bookId)), ...mLs.map((l) => String(l.bookId))])
      filtered = books.filter(
        (b) => regex.test(b.title) || (b.keywords || []).some((k) => regex.test(k)) || matchIds.has(String(b._id))
      )
    }

    const activeIds = filtered.map((b) => b._id)
    const [chCounts, lsCounts, resCounts] = await Promise.all([
      EduChapter.aggregate([
        { $match: { bookId: { $in: activeIds }, isActive: true } },
        { $group: { _id: '$bookId', count: { $sum: 1 } } },
      ]),
      EduLesson.aggregate([
        { $match: { bookId: { $in: activeIds }, isActive: true } },
        { $group: { _id: '$bookId', count: { $sum: 1 } } },
      ]),
      EduResource.aggregate([
        { $match: { bookId: { $in: activeIds }, isActive: true } },
        { $group: { _id: { bookId: '$bookId', category: '$category' }, count: { $sum: 1 } } },
      ]),
    ])
    const chMap = new Map(chCounts.map((r: any) => [String(r._id), r.count]))
    const lsMap = new Map(lsCounts.map((r: any) => [String(r._id), r.count]))
    const resMap = new Map<string, Record<string, number>>()
    for (const r of resCounts) {
      const bk = String(r._id.bookId)
      const cur = resMap.get(bk) || {}
      cur[r._id.category] = r.count
      resMap.set(bk, cur)
    }

    const progressByBook = new Map<string, { completed: number; needsReview: number }>()
    for (const p of profile?.studyProgress || []) {
      const k = String(p.bookId)
      const cur = progressByBook.get(k) || { completed: 0, needsReview: 0 }
      if (p.status === 'completed') cur.completed += 1
      if (p.status === 'needs_review') cur.needsReview += 1
      progressByBook.set(k, cur)
    }

    const data = filtered.map((b) => {
      const rc = resMap.get(String(b._id)) || {}
      return {
        ...b,
        chaptersCount: chMap.get(String(b._id)) || 0,
        lessonsCount: lsMap.get(String(b._id)) || 0,
        resourceCounts: {
          hasMainPdf: (rc.main_pdf || 0) > 0,
          hasStepByStep: (rc.step_by_step || 0) > 0,
          notesCount: rc.note || 0,
          videosCount: rc.video || 0,
          customCount: rc.custom || 0,
        },
        studentProgress: progressByBook.get(String(b._id)) || { completed: 0, needsReview: 0 },
      }
    })

    res.status(200).json({ success: true, data })
  } catch (error: any) {
    logger.error('getStudentBooks error:', error)
    res.status(500).json({ success: false, message: 'خطا در دریافت کتاب‌ها' })
  }
}

export const getStudentBookDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const bookId = String(req.params.bookId)
    const [book, chapters, lessons, profile] = await Promise.all([
      EduBook.findOne({ _id: bookId, isActive: true })
        .populate('levelId', 'name')
        .populate('gradeId', 'name numericOrder')
        .populate('fieldId', 'name')
        .lean(),
      EduChapter.find({ bookId, isActive: true }).sort({ order: 1 }).lean(),
      EduLesson.find({ bookId, isActive: true }).sort({ order: 1 }).lean(),
      getOptionalStudentProfile(req),
    ])

    if (!book) {
      res.status(404).json({ success: false, message: 'کتاب یافت نشد یا غیرفعال شده است' })
      return
    }

    const levelRefId = (book.levelId as any)?._id || book.levelId
    const gradeRefId = (book.gradeId as any)?._id || book.gradeId
    const fieldRefId = (book.fieldId as any)?._id || book.fieldId || null

    // Scope matches either book-specific items or level/grade-inherited items (bookId: null)
    const scopeFilter = {
      isActive: true,
      $or: [
        { bookId: book._id },
        {
          bookId: null,
          levelId: levelRefId,
          $and: [
            { $or: [{ gradeId: null }, { gradeId: gradeRefId }] },
            ...(fieldRefId ? [{ $or: [{ fieldId: null }, { fieldId: fieldRefId }] }] : [{ fieldId: null }]),
          ],
        },
      ],
    }

    const [bookResources, customSections, qBookIds] = await Promise.all([
      EduResource.find(scopeFilter)
        .populate('chapterId', 'title')
        .populate('lessonId', 'title')
        .sort({ order: 1, createdAt: 1 })
        .lean(),
      EduCustomSection.find(scopeFilter).sort({ order: 1, createdAt: 1 }).lean(),
      resolveQuestionBankBookIds(book),
    ])

    const totalQuestions =
      qBookIds.length > 0
        ? await Question.countDocuments({
            book: { $in: qBookIds },
            isActive: true,
            status: { $ne: 'مشکل-دار' },
          })
        : 0

    const customBySection = new Map<string, any[]>()
    for (const r of bookResources) {
      if (r.category === 'custom' && r.customSectionId) {
        const k = String(r.customSectionId)
        const arr = customBySection.get(k) || []
        arr.push(r)
        customBySection.set(k, arr)
      }
    }

    const progressMap = new Map<string, string>()
    for (const p of profile?.studyProgress || []) {
      progressMap.set(p.stableId, p.status)
    }

    const lessonsByCh = new Map<string, any[]>()
    for (const ls of lessons) {
      const k = String(ls.chapterId)
      const arr = lessonsByCh.get(k) || []
      arr.push({ ...ls, studyStatus: progressMap.get(ls.stableId) || null })
      lessonsByCh.set(k, arr)
    }

    const enrichedChapters = chapters.map((ch) => ({
      ...ch,
      studyStatus: progressMap.get(ch.stableId) || null,
      lessons: lessonsByCh.get(String(ch._id)) || [],
    }))

    res.status(200).json({
      success: true,
      data: {
        ...book,
        chapters: enrichedChapters,
        resources: {
          mainPdfs: bookResources.filter((r) => r.category === 'main_pdf'),
          stepBySteps: bookResources.filter((r) => r.category === 'step_by_step'),
          notes: bookResources.filter((r) => r.category === 'note'),
          videos: bookResources.filter((r) => r.category === 'video'),
        },
        customSections: customSections.map((sec) => ({
          ...sec,
          items: customBySection.get(String(sec._id)) || [],
        })),
        questionBankSummary: {
          totalQuestions,
          linkedBookIds: qBookIds.map(String),
        },
      },
    })
  } catch (error: any) {
    logger.error('getStudentBookDetail error:', error)
    res.status(500).json({ success: false, message: 'خطا در دریافت جزئیات کتاب' })
  }
}

export const getStudentBookQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const bookId = String(req.params.bookId)
    const book = await EduBook.findOne({ _id: bookId, isActive: true })
      .populate('gradeId', 'name numericOrder')
      .lean()

    if (!book) {
      res.status(404).json({ success: false, message: 'کتاب یافت نشد' })
      return
    }

    const qBookIds = await resolveQuestionBankBookIds(book)
    if (qBookIds.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          total: 0,
          page: 1,
          totalPages: 0,
          availableTypes: [],
          availableDifficulties: [],
          items: [],
        },
      })
      return
    }

    const baseFilter: any = {
      book: { $in: qBookIds },
      isActive: true,
      status: { $ne: 'مشکل-دار' },
    }
    const queryFilter: any = { ...baseFilter }

    if (typeof req.query.type === 'string' && req.query.type.trim()) {
      queryFilter.type = req.query.type.trim()
    }
    if (typeof req.query.difficulty === 'string' && req.query.difficulty.trim()) {
      queryFilter.difficulty = req.query.difficulty.trim()
    }
    if (req.query.pageNumber) {
      const pn = Number(req.query.pageNumber)
      if (!Number.isNaN(pn) && pn > 0) queryFilter.page_number = pn
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      queryFilter.$or = [{ question: regex }, { tags: regex }]
    }

    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(40, Math.max(5, Number(req.query.limit) || 20))
    const skip = (page - 1) * limit

    const [total, rawItems, availableTypes, availableDifficulties] = await Promise.all([
      Question.countDocuments(queryFilter),
      Question.find(queryFilter).sort({ page_number: 1, _id: 1 }).skip(skip).limit(limit).lean(),
      Question.distinct('type', baseFilter),
      Question.distinct('difficulty', baseFilter),
    ])

    const items = rawItems.map((q: any) => ({
      _id: q._id,
      type: q.type,
      difficulty: q.difficulty,
      questionText: stripQuestionHtml(q.question),
      mainQuestionText: stripQuestionHtml(q.mainQuestion),
      options: (q.options || []).map((o: string) => stripQuestionHtml(o)),
      matchingLeft: (q.matching_left || []).map((o: string) => stripQuestionHtml(o)),
      matchingRight: (q.matching_right || []).map((o: string) => stripQuestionHtml(o)),
      answerText: stripQuestionHtml(q.answer),
      pageNumber: q.page_number || [],
      sourceImage: q.source_image || '',
      tags: q.tags || [],
      isComposite: Boolean(q.is_composite),
      sub: (q.sub || []).map((s: any) => ({
        sub_id: s.sub_id,
        type: s.type,
        questionText: stripQuestionHtml(s.question),
        options: (s.options || []).map((o: string) => stripQuestionHtml(o)),
        answerText: stripQuestionHtml(s.answer),
      })),
    }))

    res.status(200).json({
      success: true,
      data: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        availableTypes,
        availableDifficulties,
        items,
      },
    })
  } catch (error: any) {
    logger.error('getStudentBookQuestions error:', error)
    res.status(500).json({ success: false, message: 'خطا در دریافت نمونه سوالات کتاب' })
  }
}

export const searchStudentEduByKeywords = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim()
    if (!q) { res.status(200).json({ success: true, data: [] }); return }
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

    const bookFilter: any = { isActive: true }
    if (req.query.gradeId) bookFilter.gradeId = String(req.query.gradeId)
    if (req.query.fieldId) bookFilter.fieldId = String(req.query.fieldId)

    const activeBooks = await EduBook.find(bookFilter).select('_id title levelId gradeId fieldId structure').lean()
    const activeBookMap = new Map(activeBooks.map((b) => [String(b._id), b]))
    const bookIds = activeBooks.map((b) => b._id)

    const [matchingChaps, matchingLessons] = await Promise.all([
      EduChapter.find({ bookId: { $in: bookIds }, isActive: true, $or: [{ title: regex }, { keywords: regex }] })
        .limit(40)
        .lean(),
      EduLesson.find({ bookId: { $in: bookIds }, isActive: true, $or: [{ title: regex }, { keywords: regex }] })
        .limit(60)
        .lean(),
    ])

    const results = [
      ...matchingChaps.map((ch) => ({
        itemType: 'chapter',
        _id: ch._id,
        stableId: ch.stableId,
        bookId: ch.bookId,
        bookTitle: activeBookMap.get(String(ch.bookId))?.title || '',
        title: ch.title,
        keywords: ch.keywords || [],
      })),
      ...matchingLessons.map((ls) => ({
        itemType: 'lesson',
        _id: ls._id,
        stableId: ls.stableId,
        bookId: ls.bookId,
        chapterId: ls.chapterId,
        bookTitle: activeBookMap.get(String(ls.bookId))?.title || '',
        title: ls.title,
        keywords: ls.keywords || [],
      })),
    ]

    res.status(200).json({ success: true, data: results })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در جستجوی کلمات کلیدی' })
  }
}

export const recordStudentStudyProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user
    const { itemType, itemId, stableId, bookId, chapterId, status = 'completed', mastery, weakScore, studyMinutes = 0 } = req.body
    if (!itemType || !itemId || !stableId || !bookId) {
      res.status(400).json({ success: false, message: 'مشخصات درس/فصل ناقص است' })
      return
    }

    let profile = await StudentProfile.findOne({ user: user._id })
    if (!profile) {
      profile = new StudentProfile({ user: user._id, studentCode: user.phoneNumber || user.username })
    }

    const list = profile.studyProgress || []
    const existingIdx = list.findIndex((p) => p.stableId === stableId || String(p.itemId) === String(itemId))
    const entry = {
      itemType,
      itemId,
      stableId,
      bookId,
      ...(chapterId ? { chapterId } : {}),
      status,
      mastery: typeof mastery === 'number' ? mastery : status === 'completed' ? 1 : status === 'needs_review' ? 0.35 : 0.5,
      weakScore: typeof weakScore === 'number' ? weakScore : status === 'needs_review' ? 1 : 0,
      studyMinutes: Number(studyMinutes) || 0,
      updatedAt: new Date(),
    }

    if (existingIdx >= 0) {
      entry.studyMinutes += Number(list[existingIdx].studyMinutes || 0)
      list[existingIdx] = entry as any
    } else {
      list.push(entry as any)
    }

    profile.studyProgress = list as any
    await profile.save()

    res.status(200).json({ success: true, message: 'پیشرفت مطالعه ثبت شد', data: entry })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در ثبت پیشرفت مطالعه' })
  }
}

/**
 * Shared DB-driven curriculum builder for Nokita AI Study Planner.
 * Strictly isolates books to the student's actual grade & field.
 */
export async function buildPlannerCurriculumForStudent(params: {
  gradeId?: string
  numericGrade?: number
  fieldId?: string | null
  fieldSlug?: string
  studentUserId?: string
}) {
  let targetGrade: any = null
  if (params.gradeId) {
    targetGrade = await EduGrade.findOne({ _id: params.gradeId, isActive: true }).lean()
  } else if (params.numericGrade) {
    targetGrade = await EduGrade.findOne({ numericOrder: params.numericGrade, isActive: true }).lean()
  }

  let targetField: any = null
  if (params.fieldId) {
    targetField = await EduField.findOne({ _id: params.fieldId, isActive: true }).lean()
  } else {
    const fieldName = mapFieldSlugToPersian(params.fieldSlug)
    if (fieldName && targetGrade) {
      targetField = await EduField.findOne({ levelId: targetGrade.levelId, name: fieldName, isActive: true }).lean()
    }
  }

  const bookQuery: any = { isActive: true }
  if (targetGrade) bookQuery.gradeId = targetGrade._id
  if (targetField) {
    bookQuery.$or = [{ fieldId: targetField._id }, { fieldId: null }]
  } else if (targetGrade) {
    // Elementary / Middle grades have no fields
    const levelHasFields = (await EduField.countDocuments({ levelId: targetGrade.levelId, isActive: true })) > 0
    if (!levelHasFields) bookQuery.fieldId = null
  }

  const books = await EduBook.find(bookQuery).sort({ order: 1 }).lean()
  const bookIds = books.map((b) => b._id)
  const [chapters, lessons, profile] = await Promise.all([
    EduChapter.find({ bookId: { $in: bookIds }, isActive: true }).sort({ order: 1 }).lean(),
    EduLesson.find({ bookId: { $in: bookIds }, isActive: true }).sort({ order: 1 }).lean(),
    params.studentUserId ? StudentProfile.findOne({ user: params.studentUserId }).lean() : Promise.resolve(null),
  ])

  const progressMap = new Map<string, any>()
  for (const p of profile?.studyProgress || []) progressMap.set(p.stableId, p)

  const lessonsByCh = new Map<string, any[]>()
  for (const ls of lessons) {
    const k = String(ls.chapterId)
    const arr = lessonsByCh.get(k) || []
    arr.push(ls)
    lessonsByCh.set(k, arr)
  }

  const chaptersByBook = new Map<string, any[]>()
  for (const ch of chapters) {
    const k = String(ch.bookId)
    const arr = chaptersByBook.get(k) || []
    arr.push(ch)
    chaptersByBook.set(k, arr)
  }

  const subjects = books.map((book, idx) => {
    const bChaps = chaptersByBook.get(String(book._id)) || []
    return {
      id: book.stableId,
      dbId: String(book._id),
      nameFa: book.title,
      colorToken: SUBJECT_PALETTE[idx % SUBJECT_PALETTE.length],
      structure: book.structure,
      gradeLevels: targetGrade ? [targetGrade.numericOrder] : [],
      fields: targetField ? [params.fieldSlug || targetField.name] : ['general'],
      chapters: bChaps.map((ch) => {
        const chLessons = lessonsByCh.get(String(ch._id)) || []
        const topics =
          chLessons.length > 0
            ? chLessons.map((ls) => {
                const prog = progressMap.get(ls.stableId)
                return {
                  id: ls.stableId,
                  dbId: String(ls._id),
                  chapterId: ch.stableId,
                  titleFa: ls.title,
                  baseLearnMinutes: 45,
                  basePracticeMinutes: 35,
                  difficulty: prog?.status === 'needs_review' ? 4 : 3,
                  tags: ls.keywords || [],
                  needsReview: prog?.status === 'needs_review',
                  completed: prog?.status === 'completed',
                }
              })
            : [
                {
                  id: ch.stableId,
                  dbId: String(ch._id),
                  chapterId: ch.stableId,
                  titleFa: ch.title,
                  baseLearnMinutes: 45,
                  basePracticeMinutes: 35,
                  difficulty: progressMap.get(ch.stableId)?.status === 'needs_review' ? 4 : 3,
                  tags: ch.keywords || [],
                  needsReview: progressMap.get(ch.stableId)?.status === 'needs_review',
                  completed: progressMap.get(ch.stableId)?.status === 'completed',
                },
              ]

        return {
          id: ch.stableId,
          dbId: String(ch._id),
          bookId: book.stableId,
          order: ch.order,
          titleFa: ch.title,
          keywords: ch.keywords || [],
          topics,
        }
      }),
    }
  })

  return { grade: targetGrade, field: targetField, subjects }
}

export const getPlannerCurriculum = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user
    const profile = user?._id ? await StudentProfile.findOne({ user: user._id }).lean() : null

    const gradeId = typeof req.query.gradeId === 'string' ? req.query.gradeId : profile?.eduGradeId ? String(profile.eduGradeId) : undefined
    const fieldId = typeof req.query.fieldId === 'string' ? req.query.fieldId : profile?.eduFieldId ? String(profile.eduFieldId) : undefined
    const numericGrade = req.query.grade ? Number(req.query.grade) : undefined
    const fieldSlug = typeof req.query.field === 'string' ? req.query.field : undefined

    const data = await buildPlannerCurriculumForStudent({
      gradeId,
      numericGrade,
      fieldId,
      fieldSlug,
      studentUserId: user?._id ? String(user._id) : undefined,
    })

    res.status(200).json({
      success: true,
      data,
      contentLimitationNotice:
        'ساختار درسی، کتاب‌ها، فصل‌ها، درس‌ها و کلمات کلیدی مستقیماً از بانک اطلاعاتی نوکیتا خوانده می‌شوند (متن کامل کتاب‌های درسی در فایل منبع وجود ندارد).',
    })
  } catch (error: any) {
    logger.error('getPlannerCurriculum error:', error)
    res.status(500).json({ success: false, message: 'خطا در دریافت سرفصل‌های برنامه‌ریزی' })
  }
}

export const generateAiStudyPlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user
    const profile = user?._id ? await StudentProfile.findOne({ user: user._id }).lean() : null
    const {
      gradeId,
      fieldId,
      numericGrade,
      fieldSlug,
      horizon = 'weekly',
      weakTopicQuery = '',
      dailyMinutes = 180,
    } = req.body || {}

    const curr = await buildPlannerCurriculumForStudent({
      gradeId: gradeId || (profile?.eduGradeId ? String(profile.eduGradeId) : undefined),
      fieldId: fieldId !== undefined ? fieldId : profile?.eduFieldId ? String(profile.eduFieldId) : undefined,
      numericGrade: numericGrade ? Number(numericGrade) : undefined,
      fieldSlug,
      studentUserId: user?._id ? String(user._id) : undefined,
    })

    const q = String(weakTopicQuery || '').trim().toLowerCase()
    const daysCount = horizon === 'daily' ? 1 : horizon === 'monthly' ? 28 : horizon === 'review' ? 5 : 7

    const prioritizedTopics: any[] = []
    for (const subj of curr.subjects) {
      for (const ch of subj.chapters) {
        const chapterMatchesQuery =
          q.length > 0 &&
          (ch.titleFa.toLowerCase().includes(q) || (ch.keywords || []).some((k: string) => k.toLowerCase().includes(q)))
        for (const topic of ch.topics) {
          const topicMatchesQuery =
            chapterMatchesQuery ||
            (q.length > 0 &&
              (topic.titleFa.toLowerCase().includes(q) || (topic.tags || []).some((k: string) => k.toLowerCase().includes(q))))

          if (horizon === 'review' && !topic.completed && !topic.needsReview && !topicMatchesQuery) continue

          let score = topic.completed ? 10 : 50
          if (topic.needsReview) score += 40
          if (topicMatchesQuery) score += 80

          prioritizedTopics.push({
            bookTitle: subj.nameFa,
            bookId: subj.dbId,
            chapterTitle: ch.titleFa,
            chapterId: ch.dbId,
            topicTitle: topic.titleFa,
            topicId: topic.id,
            keywords: (topic.tags || []).slice(0, 6),
            isWeakMatch: topicMatchesQuery || topic.needsReview,
            needsReview: topic.needsReview,
            completed: topic.completed,
            recommendedMinutes: topicMatchesQuery || topic.needsReview ? 60 : 40,
            priorityScore: score,
          })
        }
      }
    }

    prioritizedTopics.sort((a, b) => b.priorityScore - a.priorityScore)

    const sessionsPerDay = Math.max(1, Math.floor(Number(dailyMinutes || 180) / 45))
    const selected = prioritizedTopics.slice(0, daysCount * sessionsPerDay)

    res.status(200).json({
      success: true,
      data: {
        horizon,
        daysCount,
        grade: curr.grade?.name || null,
        field: curr.field?.name || null,
        booksCount: curr.subjects.length,
        weakMatchedCount: selected.filter((s) => s.isWeakMatch).length,
        sessions: selected,
        contentLimitationNotice:
          'این برنامه با اتکا به ساختار واقعی کتاب‌ها، فصل‌ها، درس‌ها و کلمات کلیدی ثبت‌شده در دیتابیس نوکیتا تولید شده است؛ سیستم به متن کامل صفحات کتاب دسترسی ندارد.',
      },
    })
  } catch (error: any) {
    logger.error('generateAiStudyPlan error:', error)
    res.status(500).json({ success: false, message: 'خطا در تولید برنامه مطالعاتی' })
  }
}
