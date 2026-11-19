import crypto from 'crypto'
import {
  EduAuditLog,
  EduBackupSnapshot,
  EduBook,
  EduChapter,
  EduField,
  EduGrade,
  EduLesson,
  EduLevel,
  type EduBookStructure,
} from '../../../core/models/EduContent.js'
import { ensureGraphicForTaxonomy } from './eduMedia.service.js'

export type ImportMode = 'add_new' | 'update_existing' | 'merge' | 'replace_all'

export interface NormalizedLessonInput {
  stableId: string
  bookStableId: string
  chapterStableId: string
  jsonKey: string
  title: string
  keywords: string[]
  order: number
}

export interface NormalizedChapterInput {
  stableId: string
  bookStableId: string
  jsonKey: string
  title: string
  keywords: string[]
  hasEmptyLessons: boolean
  order: number
  lessons: NormalizedLessonInput[]
}

export interface NormalizedBookInput {
  stableId: string
  title: string
  levelName: string
  levelStableId: string
  gradeName: string
  gradeStableId: string
  fieldName: string | null
  fieldStableId: string | null
  structure: EduBookStructure
  keywords: string[]
  order: number
  chapters: NormalizedChapterInput[]
}

export interface ParseValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  duplicatesInFile: Array<{ index: number; stableId: string; title: string; grade: string; field: string | null; identical: boolean }>
  incompleteItems: Array<{ stableId: string; title: string; chapterTitle: string; reason: string }>
  levels: Array<{ stableId: string; name: string; code: string; order: number }>
  grades: Array<{ stableId: string; levelStableId: string; name: string; numericOrder: number; order: number }>
  fields: Array<{ stableId: string; levelStableId: string; name: string; order: number }>
  books: NormalizedBookInput[]
  summary: {
    rawBookCount: number
    uniqueBookCount: number
    levels: number
    grades: number
    fields: number
    chapterStructureBooks: number
    lessonStructureBooks: number
    chapters: number
    emptyLessonChapters: number
    lessons: number
    keywordsCount: number
  }
}

const LEVEL_ORDER_MAP: Record<string, { order: number; code: string }> = {
  'ابتدایی': { order: 1, code: 'ELEMENTARY' },
  'متوسطه اول': { order: 2, code: 'MIDDLE' },
  'متوسطه دوم': { order: 3, code: 'HIGH' },
}

const GRADE_NUMERIC_MAP: Record<string, number> = {
  'اول': 1,
  'دوم': 2,
  'سوم': 3,
  'چهارم': 4,
  'پنجم': 5,
  'ششم': 6,
  'هفتم': 7,
  'هشتم': 8,
  'نهم': 9,
  'دهم': 10,
  'یازدهم': 11,
  'دوازدهم': 12,
}

function cleanStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeStablePart(v: string): string {
  return v.trim().replace(/\s+/g, ' ')
}

function buildBookStableId(level: string, grade: string, field: string | null, title: string, explicitId?: unknown): string {
  const custom = cleanStr(explicitId)
  if (custom) return custom
  return `bk::${normalizeStablePart(level)}::${normalizeStablePart(grade)}::${normalizeStablePart(field || '_')}::${normalizeStablePart(title)}`
}

function uniqueStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of arr) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

function hashObject(val: unknown): string {
  return crypto.createHash('sha1').update(JSON.stringify(val)).digest('hex')
}

export function parseAndValidateEduJson(rawPayload: unknown): ParseValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const duplicatesInFile: ParseValidationResult['duplicatesInFile'] = []
  const incompleteItems: ParseValidationResult['incompleteItems'] = []

  const items: any[] = Array.isArray(rawPayload)
    ? rawPayload
    : rawPayload && typeof rawPayload === 'object' && Array.isArray((rawPayload as any).books)
      ? (rawPayload as any).books
      : []

  if (!Array.isArray(rawPayload) && items.length === 0) {
    return {
      valid: false,
      errors: ['ساختار فایل JSON نامعتبر است. فایل باید آرایه‌ای از کتاب‌ها باشد.'],
      warnings: [],
      duplicatesInFile: [],
      incompleteItems: [],
      levels: [],
      grades: [],
      fields: [],
      books: [],
      summary: {
        rawBookCount: 0,
        uniqueBookCount: 0,
        levels: 0,
        grades: 0,
        fields: 0,
        chapterStructureBooks: 0,
        lessonStructureBooks: 0,
        chapters: 0,
        emptyLessonChapters: 0,
        lessons: 0,
        keywordsCount: 0,
      },
    }
  }

  const levelsMap = new Map<string, { stableId: string; name: string; code: string; order: number }>()
  const gradesMap = new Map<string, { stableId: string; levelStableId: string; name: string; numericOrder: number; order: number }>()
  const fieldsMap = new Map<string, { stableId: string; levelStableId: string; name: string; order: number }>()
  const seenBookHashes = new Map<string, { hash: string; index: number }>()
  const books: NormalizedBookInput[] = []

  let chapterCount = 0
  let lessonCount = 0
  let emptyLessonChapters = 0
  let keywordsCount = 0
  let chapterStructureBooks = 0
  let lessonStructureBooks = 0

  items.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      errors.push(`ردیف ${idx + 1}: ساختار کتاب یک آبجکت معتبر نیست.`)
      return
    }

    const title = cleanStr(raw.title)
    const gradeName = cleanStr(raw.grade)
    const levelName = cleanStr(raw.level)
    const fieldName = cleanStr(raw.field) || null
    const structure = raw.structure === 'lesson' ? 'lesson' : raw.structure === 'chapter' ? 'chapter' : null

    if (!title) errors.push(`ردیف ${idx + 1}: عنوان کتاب خالی است.`)
    if (!levelName) errors.push(`ردیف ${idx + 1} (${title || 'بدون عنوان'}): مقطع تحصیلی مشخص نشده است.`)
    if (!gradeName) errors.push(`ردیف ${idx + 1} (${title || 'بدون عنوان'}): پایه تحصیلی مشخص نشده است.`)
    if (!structure) errors.push(`ردیف ${idx + 1} (${title || 'بدون عنوان'}): فیلد structure باید chapter یا lesson باشد.`)
    if (!raw.chapters || typeof raw.chapters !== 'object' || Array.isArray(raw.chapters)) {
      errors.push(`ردیف ${idx + 1} (${title || 'بدون عنوان'}): فیلد chapters باید یک آبجکت معتبر باشد.`)
      return
    }
    if (!title || !levelName || !gradeName || !structure) return

    const levelStableId = cleanStr(raw.levelStableId) || `lvl::${normalizeStablePart(levelName)}`
    const gradeStableId = cleanStr(raw.gradeStableId) || `grd::${normalizeStablePart(levelName)}::${normalizeStablePart(gradeName)}`
    const fieldStableId = fieldName ? (cleanStr(raw.fieldStableId) || `fld::${normalizeStablePart(levelName)}::${normalizeStablePart(fieldName)}`) : null
    const bookStableId = buildBookStableId(levelName, gradeName, fieldName, title, raw.stableId)

    const canonicalHash = hashObject({
      levelName,
      gradeName,
      fieldName,
      title,
      structure,
      chapters: raw.chapters,
    })

    const existingBook = seenBookHashes.get(bookStableId)
    if (existingBook) {
      const identical = existingBook.hash === canonicalHash
      duplicatesInFile.push({
        index: idx + 1,
        stableId: bookStableId,
        title,
        grade: gradeName,
        field: fieldName,
        identical,
      })
      warnings.push(
        identical
          ? `کتاب تکراری در فایل (ردیف ${idx + 1}): «${title} - ${gradeName}${fieldName ? ` (${fieldName})` : ''}» دقیقاً مشابه ردیف ${existingBook.index + 1} بود و یکتا شد.`
          : `کتاب با شناسه مشابه در فایل (ردیف ${idx + 1}): «${title} - ${gradeName}»؛ آخرین نسخه نگه داشته نمی‌شود تا داده قبلی بازنویسی نشود.`
      )
      return
    }
    seenBookHashes.set(bookStableId, { hash: canonicalHash, index: idx })

    if (!levelsMap.has(levelStableId)) {
      const meta = LEVEL_ORDER_MAP[levelName]
      levelsMap.set(levelStableId, {
        stableId: levelStableId,
        name: levelName,
        code: meta?.code || `LVL_${levelsMap.size + 1}`,
        order: meta?.order || levelsMap.size + 1,
      })
    }

    if (!gradesMap.has(gradeStableId)) {
      const numOrder = GRADE_NUMERIC_MAP[gradeName] || gradesMap.size + 1
      gradesMap.set(gradeStableId, {
        stableId: gradeStableId,
        levelStableId,
        name: gradeName,
        numericOrder: numOrder,
        order: numOrder,
      })
    }

    if (fieldStableId && fieldName && !fieldsMap.has(fieldStableId)) {
      fieldsMap.set(fieldStableId, {
        stableId: fieldStableId,
        levelStableId,
        name: fieldName,
        order: fieldsMap.size + 1,
      })
    }

    if (structure === 'chapter') chapterStructureBooks += 1
    else lessonStructureBooks += 1

    const bookKeywords = uniqueStringArray(raw.keywords)
    keywordsCount += bookKeywords.length

    const normalizedChapters: NormalizedChapterInput[] = []
    const chEntries = Object.entries(raw.chapters as Record<string, any>)

    chEntries.forEach(([jsonKey, chVal], chIdx) => {
      if (!chVal || typeof chVal !== 'object') {
        warnings.push(`کتاب «${title} - ${gradeName}»: بخش «${jsonKey}» ساختار آبجکت ندارد و نادیده گرفته شد.`)
        return
      }
      const chTitle = cleanStr(chVal.title) || jsonKey
      const chKeywords = uniqueStringArray(chVal.keywords)
      keywordsCount += chKeywords.length
      const chStableId = cleanStr(chVal.stableId) || `${bookStableId}::ch::${normalizeStablePart(jsonKey)}`

      const rawLessons = chVal.lessons
      const lessonsList: NormalizedLessonInput[] = []

      if (rawLessons === undefined || rawLessons === null) {
        incompleteItems.push({
          stableId: chStableId,
          title,
          chapterTitle: chTitle,
          reason: 'کلید lessons در JSON وجود نداشت (به‌عنوان بخش بدون زیرمجموعه ثبت می‌شود).',
        })
      } else if (typeof rawLessons === 'object' && !Array.isArray(rawLessons)) {
        Object.entries(rawLessons as Record<string, any>).forEach(([lKey, lVal], lIdx) => {
          if (!lVal || typeof lVal !== 'object') return
          const lTitle = cleanStr(lVal.title) || lKey
          const lKeywords = uniqueStringArray(lVal.keywords)
          keywordsCount += lKeywords.length
          const lStableId = cleanStr(lVal.stableId) || `${chStableId}::ls::${normalizeStablePart(lKey)}`
          lessonsList.push({
            stableId: lStableId,
            bookStableId,
            chapterStableId: chStableId,
            jsonKey: lKey,
            title: lTitle,
            keywords: lKeywords,
            order: lIdx + 1,
          })
        })
      }

      if (chKeywords.length === 0) {
        incompleteItems.push({
          stableId: chStableId,
          title,
          chapterTitle: chTitle,
          reason: 'بدون کلمات کلیدی',
        })
      }

      const hasEmptyLessons = lessonsList.length === 0
      if (hasEmptyLessons) emptyLessonChapters += 1
      chapterCount += 1
      lessonCount += lessonsList.length

      normalizedChapters.push({
        stableId: chStableId,
        bookStableId,
        jsonKey,
        title: chTitle,
        keywords: chKeywords,
        hasEmptyLessons,
        order: chIdx + 1,
        lessons: lessonsList,
      })
    })

    books.push({
      stableId: bookStableId,
      title,
      levelName,
      levelStableId,
      gradeName,
      gradeStableId,
      fieldName,
      fieldStableId,
      structure,
      keywords: bookKeywords,
      order: books.length + 1,
      chapters: normalizedChapters,
    })
  })

  return {
    valid: errors.length === 0 && books.length > 0,
    errors,
    warnings,
    duplicatesInFile,
    incompleteItems,
    levels: Array.from(levelsMap.values()),
    grades: Array.from(gradesMap.values()),
    fields: Array.from(fieldsMap.values()),
    books,
    summary: {
      rawBookCount: items.length,
      uniqueBookCount: books.length,
      levels: levelsMap.size,
      grades: gradesMap.size,
      fields: fieldsMap.size,
      chapterStructureBooks,
      lessonStructureBooks,
      chapters: chapterCount,
      emptyLessonChapters,
      lessons: lessonCount,
      keywordsCount,
    },
  }
}

export async function previewEduJsonImport(rawPayload: unknown) {
  const parsed = parseAndValidateEduJson(rawPayload)
  if (!parsed.valid) {
    return { parsed, diff: null }
  }

  const [existingLevels, existingGrades, existingFields, existingBooks, existingChapters, existingLessons] =
    await Promise.all([
      EduLevel.find().lean(),
      EduGrade.find().lean(),
      EduField.find().lean(),
      EduBook.find().lean(),
      EduChapter.find().lean(),
      EduLesson.find().lean(),
    ])

  const dbBookMap = new Map(existingBooks.map((b) => [b.stableId, b]))
  const dbChapMap = new Map(existingChapters.map((c) => [c.stableId, c]))
  const dbLessonMap = new Map(existingLessons.map((l) => [l.stableId, l]))

  const incomingBookIds = new Set<string>()
  const newBooks: Array<{ stableId: string; title: string; grade: string; field: string | null }> = []
  const changedBooks: Array<{ stableId: string; title: string; grade: string; reason: string }> = []
  let unchangedBooksCount = 0

  let newChapters = 0
  let changedChapters = 0
  let unchangedChapters = 0
  let newLessons = 0
  let changedLessons = 0
  let unchangedLessons = 0

  for (const book of parsed.books) {
    incomingBookIds.add(book.stableId)
    const existing = dbBookMap.get(book.stableId)
    let bookHasChange = false

    if (!existing) {
      newBooks.push({ stableId: book.stableId, title: book.title, grade: book.gradeName, field: book.fieldName })
    } else {
      const reasons: string[] = []
      if (existing.title !== book.title) reasons.push('تغییر عنوان')
      if (existing.structure !== book.structure) reasons.push('تغییر ساختار')
      if (JSON.stringify(existing.keywords || []) !== JSON.stringify(book.keywords || [])) reasons.push('تغییر کلمات کلیدی')
      if (reasons.length > 0) {
        bookHasChange = true
        changedBooks.push({ stableId: book.stableId, title: book.title, grade: book.gradeName, reason: reasons.join('، ') })
      }
    }

    for (const ch of book.chapters) {
      const exCh = dbChapMap.get(ch.stableId)
      if (!exCh) {
        newChapters += 1
        if (existing) bookHasChange = true
      } else if (
        exCh.title !== ch.title ||
        exCh.order !== ch.order ||
        JSON.stringify(exCh.keywords || []) !== JSON.stringify(ch.keywords || [])
      ) {
        changedChapters += 1
        bookHasChange = true
      } else {
        unchangedChapters += 1
      }

      for (const ls of ch.lessons) {
        const exLs = dbLessonMap.get(ls.stableId)
        if (!exLs) {
          newLessons += 1
          if (existing) bookHasChange = true
        } else if (
          exLs.title !== ls.title ||
          exLs.order !== ls.order ||
          JSON.stringify(exLs.keywords || []) !== JSON.stringify(ls.keywords || [])
        ) {
          changedLessons += 1
          bookHasChange = true
        } else {
          unchangedLessons += 1
        }
      }
    }

    if (existing) {
      if (bookHasChange && !changedBooks.some((b) => b.stableId === book.stableId)) {
        changedBooks.push({ stableId: book.stableId, title: book.title, grade: book.gradeName, reason: 'تغییر در فصل‌ها یا درس‌ها' })
      } else if (!bookHasChange) {
        unchangedBooksCount += 1
      }
    }
  }

  const removedBooks = existingBooks
    .filter((b) => !incomingBookIds.has(b.stableId))
    .map((b) => ({ stableId: b.stableId, title: b.title }))

  const existingLevelIds = new Set(existingLevels.map((l) => l.stableId))
  const existingGradeIds = new Set(existingGrades.map((g) => g.stableId))
  const existingFieldIds = new Set(existingFields.map((f) => f.stableId))

  return {
    parsed,
    diff: {
      newLevels: parsed.levels.filter((l) => !existingLevelIds.has(l.stableId)).length,
      newGrades: parsed.grades.filter((g) => !existingGradeIds.has(g.stableId)).length,
      newFields: parsed.fields.filter((f) => !existingFieldIds.has(f.stableId)).length,
      newBooks,
      changedBooks,
      unchangedBooksCount,
      removedBooks,
      chapters: { new: newChapters, changed: changedChapters, unchanged: unchangedChapters },
      lessons: { new: newLessons, changed: changedLessons, unchanged: unchangedLessons },
    },
  }
}

export async function exportEduContentToJson(filter?: {
  scope?: 'all' | 'level' | 'grade' | 'field' | 'book' | 'chapters'
  id?: string
  chapterIds?: string[]
  includeStableIds?: boolean
}) {
  const scope = filter?.scope || 'all'
  const id = filter?.id

  const [levels, grades, fields] = await Promise.all([
    EduLevel.find().sort({ order: 1 }).lean(),
    EduGrade.find().sort({ order: 1 }).lean(),
    EduField.find().sort({ order: 1 }).lean(),
  ])

  const levelById = new Map(levels.map((l) => [String(l._id), l]))
  const gradeById = new Map(grades.map((g) => [String(g._id), g]))
  const fieldById = new Map(fields.map((f) => [String(f._id), f]))

  const bookQuery: any = {}
  if (scope === 'level' && id) bookQuery.levelId = id
  else if (scope === 'grade' && id) bookQuery.gradeId = id
  else if (scope === 'field' && id) bookQuery.fieldId = id
  else if (scope === 'book' && id) bookQuery._id = id

  const chapterFilterIds =
    scope === 'chapters' && Array.isArray(filter?.chapterIds) && filter.chapterIds.length > 0
      ? new Set(filter.chapterIds.map(String))
      : null

  if (chapterFilterIds) {
    const chaps = await EduChapter.find({ _id: { $in: Array.from(chapterFilterIds) } }).select('bookId').lean()
    const bIds = Array.from(new Set(chaps.map((c) => String(c.bookId))))
    bookQuery._id = { $in: bIds }
  }

  const books = await EduBook.find(bookQuery).sort({ order: 1 }).lean()
  const bookIds = books.map((b) => b._id)

  const [chapters, lessons] = await Promise.all([
    EduChapter.find({ bookId: { $in: bookIds } }).sort({ order: 1 }).lean(),
    EduLesson.find({ bookId: { $in: bookIds } }).sort({ order: 1 }).lean(),
  ])

  const lessonsByChap = new Map<string, typeof lessons>()
  for (const ls of lessons) {
    const key = String(ls.chapterId)
    const arr = lessonsByChap.get(key) || []
    arr.push(ls)
    lessonsByChap.set(key, arr)
  }

  const chaptersByBook = new Map<string, typeof chapters>()
  for (const ch of chapters) {
    if (chapterFilterIds && !chapterFilterIds.has(String(ch._id))) continue
    const key = String(ch.bookId)
    const arr = chaptersByBook.get(key) || []
    arr.push(ch)
    chaptersByBook.set(key, arr)
  }

  return books.map((book) => {
    const lvl = levelById.get(String(book.levelId))
    const grd = gradeById.get(String(book.gradeId))
    const fld = book.fieldId ? fieldById.get(String(book.fieldId)) : null

    const chaptersObj: Record<string, any> = {}
    const bookChaps = chaptersByBook.get(String(book._id)) || []
    for (const ch of bookChaps) {
      const chLessonsObj: Record<string, any> = {}
      const chLessons = lessonsByChap.get(String(ch._id)) || []
      for (const ls of chLessons) {
        chLessonsObj[ls.jsonKey] = {
          ...(filter?.includeStableIds ? { stableId: ls.stableId } : {}),
          title: ls.title,
          keywords: ls.keywords || [],
        }
      }
      chaptersObj[ch.jsonKey] = {
        ...(filter?.includeStableIds ? { stableId: ch.stableId } : {}),
        title: ch.title,
        keywords: ch.keywords || [],
        lessons: chLessonsObj,
      }
    }

    const out: Record<string, any> = {
      ...(filter?.includeStableIds ? { stableId: book.stableId } : {}),
      title: book.title,
      grade: grd?.name || '',
      level: lvl?.name || '',
    }
    if (fld?.name) out.field = fld.name
    out.structure = book.structure
    if (book.keywords && book.keywords.length > 0 && filter?.includeStableIds) out.keywords = book.keywords
    out.chapters = chaptersObj
    return out
  })
}

export async function createEduBackupSnapshot(
  label: string,
  reason: 'manual' | 'pre_replace' | 'pre_import' | 'pre_mass_delete',
  actorName = 'مدیر سیستم'
) {
  const [levels, grades, fields, books, chapters, lessons, payload] = await Promise.all([
    EduLevel.countDocuments(),
    EduGrade.countDocuments(),
    EduField.countDocuments(),
    EduBook.countDocuments(),
    EduChapter.countDocuments(),
    EduLesson.countDocuments(),
    exportEduContentToJson({ scope: 'all', includeStableIds: true }),
  ])

  return EduBackupSnapshot.create({
    label,
    reason,
    createdByName: actorName,
    stats: { levels, grades, fields, books, chapters, lessons },
    payload,
  })
}

export async function applyEduJsonImport(
  rawPayload: unknown,
  mode: ImportMode,
  actorName = 'مدیر سیستم',
  options?: { generateTaxonomyGraphics?: boolean }
) {
  const parsed = parseAndValidateEduJson(rawPayload)
  if (!parsed.valid) {
    throw new Error(parsed.errors[0] || 'فایل JSON نامعتبر است')
  }

  let backupId: string | null = null
  if (mode === 'replace_all') {
    const existingCount = await EduBook.countDocuments()
    if (existingCount > 0) {
      const snap = await createEduBackupSnapshot(
        `بکاپ خودکار پیش از جایگزینی کامل (${new Date().toLocaleDateString('fa-IR')})`,
        'pre_replace',
        actorName
      )
      backupId = String(snap._id)
    }

    await Promise.all([
      EduLesson.deleteMany({}),
      EduChapter.deleteMany({}),
      EduBook.deleteMany({}),
      EduField.deleteMany({}),
      EduGrade.deleteMany({}),
      EduLevel.deleteMany({}),
    ])
  }

  const levelIdMap = new Map<string, any>()
  const gradeIdMap = new Map<string, any>()
  const fieldIdMap = new Map<string, any>()

  const shouldGenGraphics = options?.generateTaxonomyGraphics !== false

  // 1. Levels
  for (const lvl of parsed.levels) {
    let doc = await EduLevel.findOne({ stableId: lvl.stableId })
    if (!doc && (mode === 'add_new' || mode === 'merge' || mode === 'replace_all')) {
      const image = shouldGenGraphics ? ensureGraphicForTaxonomy('level', lvl.stableId, lvl.name) : undefined
      doc = await EduLevel.create({
        stableId: lvl.stableId,
        name: lvl.name,
        code: lvl.code,
        order: lvl.order,
        isActive: true,
        ...(image ? { image } : {}),
      })
    } else if (doc && (mode === 'update_existing' || mode === 'merge')) {
      doc.name = lvl.name
      doc.code = lvl.code
      if (shouldGenGraphics && (!doc.image?.url || doc.image.status === 'needs_image')) {
        doc.image = ensureGraphicForTaxonomy('level', lvl.stableId, lvl.name)
      }
      await doc.save()
    }
    if (doc) levelIdMap.set(lvl.stableId, doc._id)
  }

  // 2. Grades
  for (const grd of parsed.grades) {
    const levelObjId = levelIdMap.get(grd.levelStableId)
    if (!levelObjId) continue
    let doc = await EduGrade.findOne({ stableId: grd.stableId })
    const parentLevel = parsed.levels.find((l) => l.stableId === grd.levelStableId)
    if (!doc && (mode === 'add_new' || mode === 'merge' || mode === 'replace_all')) {
      const image = shouldGenGraphics
        ? ensureGraphicForTaxonomy('grade', grd.stableId, `پایه ${grd.name}`, parentLevel?.name)
        : undefined
      doc = await EduGrade.create({
        stableId: grd.stableId,
        name: grd.name,
        numericOrder: grd.numericOrder,
        levelId: levelObjId,
        order: grd.order,
        isActive: true,
        ...(image ? { image } : {}),
      })
    } else if (doc && (mode === 'update_existing' || mode === 'merge')) {
      doc.name = grd.name
      doc.numericOrder = grd.numericOrder
      doc.levelId = levelObjId
      if (shouldGenGraphics && (!doc.image?.url || doc.image.status === 'needs_image')) {
        doc.image = ensureGraphicForTaxonomy('grade', grd.stableId, `پایه ${grd.name}`, parentLevel?.name)
      }
      await doc.save()
    }
    if (doc) gradeIdMap.set(grd.stableId, doc._id)
  }

  // 3. Fields (Only when present in JSON!)
  for (const fld of parsed.fields) {
    const levelObjId = levelIdMap.get(fld.levelStableId)
    if (!levelObjId) continue
    let doc = await EduField.findOne({ stableId: fld.stableId })
    if (!doc && (mode === 'add_new' || mode === 'merge' || mode === 'replace_all')) {
      const image = shouldGenGraphics ? ensureGraphicForTaxonomy('field', fld.stableId, `رشته ${fld.name}`) : undefined
      doc = await EduField.create({
        stableId: fld.stableId,
        name: fld.name,
        levelId: levelObjId,
        order: fld.order,
        isActive: true,
        ...(image ? { image } : {}),
      })
    } else if (doc && (mode === 'update_existing' || mode === 'merge')) {
      doc.name = fld.name
      doc.levelId = levelObjId
      if (shouldGenGraphics && (!doc.image?.url || doc.image.status === 'needs_image')) {
        doc.image = ensureGraphicForTaxonomy('field', fld.stableId, `رشته ${fld.name}`)
      }
      await doc.save()
    }
    if (doc) fieldIdMap.set(fld.stableId, doc._id)
  }

  // 4. Books, Chapters, Lessons
  let booksInserted = 0
  let booksUpdated = 0
  let chaptersInserted = 0
  let chaptersUpdated = 0
  let lessonsInserted = 0
  let lessonsUpdated = 0

  for (const b of parsed.books) {
    const levelId = levelIdMap.get(b.levelStableId)
    const gradeId = gradeIdMap.get(b.gradeStableId)
    const fieldId = b.fieldStableId ? fieldIdMap.get(b.fieldStableId) || null : null
    if (!levelId || !gradeId) continue

    let bookDoc = await EduBook.findOne({ stableId: b.stableId })
    const isNewBook = !bookDoc

    if (!bookDoc) {
      if (mode === 'update_existing') continue
      bookDoc = await EduBook.create({
        stableId: b.stableId,
        title: b.title,
        levelId,
        gradeId,
        fieldId,
        structure: b.structure,
        keywords: b.keywords,
        order: b.order,
        isActive: true,
        image: { url: null, imageType: 'none', source: 'none', status: 'needs_image' },
      })
      booksInserted += 1
    } else if (mode === 'update_existing' || mode === 'merge') {
      bookDoc.title = b.title
      bookDoc.levelId = levelId
      bookDoc.gradeId = gradeId
      bookDoc.fieldId = fieldId
      bookDoc.structure = b.structure
      bookDoc.keywords = b.keywords
      await bookDoc.save()
      booksUpdated += 1
    } else if (mode === 'add_new') {
      // Existing book is kept untouched in add_new mode!
      continue
    }

    for (const ch of b.chapters) {
      let chDoc = await EduChapter.findOne({ stableId: ch.stableId })
      if (!chDoc) {
        if (mode === 'update_existing' && !isNewBook) {
          // update_existing skips new records
          continue
        }
        chDoc = await EduChapter.create({
          stableId: ch.stableId,
          bookId: bookDoc._id,
          jsonKey: ch.jsonKey,
          title: ch.title,
          keywords: ch.keywords,
          hasEmptyLessons: ch.hasEmptyLessons,
          order: ch.order,
          isActive: true,
        })
        chaptersInserted += 1
      } else if (mode === 'update_existing' || mode === 'merge') {
        chDoc.jsonKey = ch.jsonKey
        chDoc.title = ch.title
        chDoc.keywords = ch.keywords
        chDoc.hasEmptyLessons = ch.hasEmptyLessons
        chDoc.order = ch.order
        await chDoc.save()
        chaptersUpdated += 1
      }

      if (!chDoc) continue

      for (const ls of ch.lessons) {
        const lsDoc = await EduLesson.findOne({ stableId: ls.stableId })
        if (!lsDoc) {
          if (mode === 'update_existing') continue
          await EduLesson.create({
            stableId: ls.stableId,
            bookId: bookDoc._id,
            chapterId: chDoc._id,
            jsonKey: ls.jsonKey,
            title: ls.title,
            keywords: ls.keywords,
            order: ls.order,
            isActive: true,
          })
          lessonsInserted += 1
        } else if (mode === 'update_existing' || mode === 'merge') {
          lsDoc.jsonKey = ls.jsonKey
          lsDoc.title = ls.title
          lsDoc.keywords = ls.keywords
          lsDoc.order = ls.order
          await lsDoc.save()
          lessonsUpdated += 1
        }
      }
    }
  }

  await EduAuditLog.create({
    action: 'import',
    entityType: 'system',
    actorName,
    summary: `ورود JSON در حالت «${mode}»: ${booksInserted} کتاب جدید، ${booksUpdated} کتاب به‌روزرسانی، ${chaptersInserted} فصل جدید، ${lessonsInserted} درس جدید`,
    details: {
      mode,
      backupId,
      booksInserted,
      booksUpdated,
      chaptersInserted,
      chaptersUpdated,
      lessonsInserted,
      lessonsUpdated,
      duplicatesSkipped: parsed.duplicatesInFile.length,
    },
  })

  return {
    backupId,
    booksInserted,
    booksUpdated,
    chaptersInserted,
    chaptersUpdated,
    lessonsInserted,
    lessonsUpdated,
    summary: parsed.summary,
    duplicatesInFile: parsed.duplicatesInFile,
    incompleteItemsCount: parsed.incompleteItems.length,
  }
}

export async function restoreEduBackupSnapshot(snapshotId: string, actorName = 'مدیر سیستم') {
  const snap = await EduBackupSnapshot.findById(snapshotId).lean()
  if (!snap) throw new Error('نسخه پشتیبان مورد نظر یافت نشد')

  const result = await applyEduJsonImport(snap.payload, 'replace_all', actorName, {
    generateTaxonomyGraphics: true,
  })

  await EduAuditLog.create({
    action: 'restore',
    entityType: 'system',
    entityStableId: String(snap._id),
    actorName,
    summary: `بازگردانی نسخه پشتیبان «${snap.label}»`,
    details: { snapshotId: snap._id, books: result.summary.uniqueBookCount },
  })

  return result
}
