import assert from 'node:assert/strict'
import fs from 'node:fs'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import {
  EduBook,
  EduChapter,
  EduField,
  EduGrade,
  EduLesson,
  EduLevel,
  EduBackupSnapshot,
  EduCustomSection,
  EduResource,
} from '../core/models/EduContent.js'
import {
  applyEduJsonImport,
  exportEduContentToJson,
  parseAndValidateEduJson,
  previewEduJsonImport,
  restoreEduBackupSnapshot,
} from '../modules/admin/services/eduContentImport.service.js'
import { StudentProfile } from '../core/models/StudentProfile.js'
import { User } from '../core/models/User.js'
import {
  getStudentBooks,
  getStudentBookDetail,
  getStudentBookQuestions,
  searchStudentEduByKeywords,
  recordStudentStudyProgress,
  getPlannerCurriculum,
  generateAiStudyPlan,
} from '../modules/student/controllers/student.eduContent.controller.js'
import { updateStudentProfile } from '../modules/student/controllers/student.profile.controller.js'

function mockRes() {
  const out: { statusCode: number; body: any } = { statusCode: 200, body: null }
  const res: any = {
    status(code: number) {
      out.statusCode = code
      return res
    },
    json(payload: any) {
      out.body = payload
      return res
    },
  }
  return { res, out }
}

dotenv.config()

const JSON_PATH = '/Users/apple/Downloads/1_31288015858 (1).json'

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/question-cms'
  await mongoose.connect(uri)

  // 1. Validate & audit real JSON file
  const rawJson = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'))
  const parsed = parseAndValidateEduJson(rawJson)
  assert.equal(parsed.valid, true, 'Input JSON must validate cleanly')
  assert.equal(parsed.summary.rawBookCount, 149)
  assert.equal(parsed.summary.uniqueBookCount, 147, '2 exact duplicates should be deduplicated')
  assert.equal(parsed.duplicatesInFile.length, 2)
  assert.equal(parsed.summary.levels, 3)
  assert.equal(parsed.summary.grades, 12)
  assert.equal(parsed.summary.fields, 3, 'Only High school has 3 fields; no fake fields for Elementary/Middle')

  // Verify invalid JSON rejection
  const badParsed = parseAndValidateEduJson([{ title: '', level: 'ابتدایی', structure: 'bad' }])
  assert.equal(badParsed.valid, false)
  assert.ok(badParsed.errors.length > 0)

  // 2. Seed initial DB via replace_all cleanly
  const importRes = await applyEduJsonImport(rawJson, 'replace_all', 'سیستم اولیه')
  assert.equal(importRes.booksInserted, 147)

  const [lvlCount, grdCount, fldCount, bkCount, chCount, lsCount] = await Promise.all([
    EduLevel.countDocuments(),
    EduGrade.countDocuments(),
    EduField.countDocuments(),
    EduBook.countDocuments(),
    EduChapter.countDocuments(),
    EduLesson.countDocuments(),
  ])
  assert.equal(lvlCount, 3)
  assert.equal(grdCount, 12)
  assert.equal(fldCount, 3)
  assert.equal(bkCount, 147)
  assert.equal(chCount, parsed.summary.chapters)
  assert.equal(lsCount, parsed.summary.lessons)

  // Verify elementary books have fieldId === null (no fake field created)
  const elemBook = await EduBook.findOne({ title: 'فارسی', structure: 'chapter' }).populate('levelId').lean()
  assert.ok(elemBook)
  assert.equal(elemBook.fieldId, null)

  // Verify lesson-structure books keep structure === 'lesson' without fake chapters
  const quranFirst = await EduBook.findOne({ title: 'قرآن', structure: 'lesson' }).lean()
  assert.ok(quranFirst)
  const quranChaps = await EduChapter.find({ bookId: quranFirst._id }).lean()
  assert.ok(quranChaps.some((c) => c.hasEmptyLessons === true))

  // Verify graphics created on disk for levels & grades while books remain needs_image
  const lvlSample = await EduLevel.findOne({ name: 'ابتدایی' }).lean()
  assert.equal(lvlSample?.image?.status, 'approved')
  assert.equal(lvlSample?.image?.imageType, 'graphic')
  assert.equal(elemBook.image?.status, 'needs_image')

  // 3. Verify Preview Diff after seed shows 0 changes & 147 unchanged
  const preview = await previewEduJsonImport(rawJson)
  assert.equal(preview.diff?.newBooks.length, 0)
  assert.equal(preview.diff?.changedBooks.length, 0)
  assert.equal(preview.diff?.unchangedBooksCount, 147)

  // 4. Verify Export -> Re-import Roundtrip & Backup/Restore
  const exportedAll = await exportEduContentToJson({ scope: 'all', includeStableIds: true })
  assert.equal(exportedAll.length, 147)

  const exportedLevel = await exportEduContentToJson({ scope: 'level', id: String(lvlSample!._id) })
  assert.equal(exportedLevel.length, 31)

  // Simulate merge with an updated title while keeping stableId, then restore pre-test snapshot cleanly!
  const snapBeforeTest = await EduBackupSnapshot.create({
    label: 'تست یکپارچه',
    reason: 'manual',
    createdByName: 'تست',
    stats: { levels: lvlCount, grades: grdCount, fields: fldCount, books: bkCount, chapters: chCount, lessons: lsCount },
    payload: exportedAll,
  })

  const oneModified = [{ ...exportedAll[0], title: 'فارسی ویرایش تست' }]
  const diffMod = await previewEduJsonImport(oneModified)
  assert.equal(diffMod.diff?.changedBooks.length, 1)
  assert.equal(diffMod.diff?.newBooks.length, 0)

  // Restore original clean dataset and remove temporary test snapshot
  await restoreEduBackupSnapshot(String(snapBeforeTest._id), 'تست خودکار')
  await EduBackupSnapshot.deleteMany({ label: 'تست یکپارچه' })

  const restoredBook = await EduBook.findOne({ stableId: exportedAll[0].stableId }).lean()
  assert.equal(restoredBook?.title, 'فارسی')

  // 5. Phase 2 & 3 End-to-End Student API, Profile & AI Planner Tests
  const highLevel = await EduLevel.findOne({ name: 'متوسطه دوم' }).lean()
  const grade10 = await EduGrade.findOne({ levelId: highLevel!._id, name: 'دهم' }).lean()
  const grade11 = await EduGrade.findOne({ levelId: highLevel!._id, name: 'یازدهم' }).lean()
  const expField = await EduField.findOne({ levelId: highLevel!._id, name: 'تجربی' }).lean()
  const humField = await EduField.findOne({ levelId: highLevel!._id, name: 'انسانی' }).lean()
  assert.ok(highLevel && grade10 && grade11 && expField && humField)

  await User.deleteMany({ username: 'edu_e2e_test' })
  await StudentProfile.deleteMany({ studentCode: '09990000001' })
  const fakeUserDoc = await User.create({
    username: 'edu_e2e_test',
    phoneNumber: '09990000001',
    password: 'TestPass123!',
    fullName: 'دانش‌آموز تست یکپارچه',
    role: 'student',
    roles: ['student'],
  })
  const fakeUserId = fakeUserDoc._id
  const fakeUser = { _id: fakeUserId, phoneNumber: '09990000001', username: 'edu_e2e_test' }

  await Promise.all([
    EduChapter.deleteMany({ stableId: 'e2e_test_chap_temp' }),
    EduBook.deleteMany({ stableId: 'e2e_test_book_temp' }),
    StudentProfile.deleteMany({ user: fakeUserId }),
  ])

  let adminTestBook: any
  let adminTestChap: any
  let testCustomSection: any = null
  const testResourceIds: any[] = []
  try {
    // 5a. Create admin test book & verify student API sees it immediately
    adminTestBook = await EduBook.create({
      stableId: 'e2e_test_book_temp',
      title: 'کتاب آزمایشی ای‌پی‌آی',
      levelId: highLevel!._id,
      gradeId: grade10!._id,
      fieldId: expField!._id,
      structure: 'chapter',
      keywords: ['آزمایشی', 'زیست_تست'],
      order: 999,
      isActive: true,
    })
    adminTestChap = await EduChapter.create({
      stableId: 'e2e_test_chap_temp',
      bookId: adminTestBook._id,
      title: 'فصل اولیه آزمایشی',
      jsonKey: 'فصل ۱',
      keywords: ['مبحث_تست_ویژه'],
      hasEmptyLessons: true,
      order: 0,
      isActive: true,
    })

    const booksCall1 = mockRes()
    await getStudentBooks(
      { query: { gradeId: String(grade10!._id), fieldId: String(expField!._id) }, user: fakeUser } as any,
      booksCall1.res
    )
    assert.equal(booksCall1.out.statusCode, 200)
    assert.ok(
      booksCall1.out.body.data.some((b: any) => String(b._id) === String(adminTestBook._id)),
      'Admin-created active book must immediately appear in student API'
    )

    // 5b. Record study progress, rename chapter title as admin, verify progress & renamed title persist
    const progCall = mockRes()
    await recordStudentStudyProgress(
      {
        user: fakeUser,
        body: {
          itemType: 'chapter',
          itemId: adminTestChap._id,
          stableId: adminTestChap.stableId,
          bookId: adminTestBook._id,
          status: 'needs_review',
          weakScore: 2,
        },
      } as any,
      progCall.res
    )
    assert.equal(progCall.out.statusCode, 200)

    await EduChapter.findByIdAndUpdate(adminTestChap._id, { title: 'فصل ویرایش‌شده آزمایشی' })
    const detailCall = mockRes()
    await getStudentBookDetail({ params: { bookId: String(adminTestBook._id) }, user: fakeUser } as any, detailCall.res)
    assert.equal(detailCall.out.statusCode, 200)
    assert.equal(detailCall.out.body.data.chapters[0].title, 'فصل ویرایش‌شده آزمایشی')
    assert.equal(detailCall.out.body.data.chapters[0].studyStatus, 'needs_review')

    // 5c. Deactivate book -> hidden from student list & search, yet studyProgress remains intact in StudentProfile
    await EduBook.findByIdAndUpdate(adminTestBook._id, { isActive: false })
    const booksCall2 = mockRes()
    await getStudentBooks(
      { query: { gradeId: String(grade10!._id), fieldId: String(expField!._id) }, user: fakeUser } as any,
      booksCall2.res
    )
    assert.equal(booksCall2.out.body.data.some((b: any) => String(b._id) === String(adminTestBook._id)), false)

    const searchDeact = mockRes()
    await searchStudentEduByKeywords({ query: { q: 'مبحث_تست_ویژه' } } as any, searchDeact.res)
    assert.equal(searchDeact.out.body.data.length, 0)

    // 5d. Update student grade/field via StudentProfile controller & confirm studyProgress is preserved
    const profUpd = mockRes()
    await updateStudentProfile(
      {
        user: fakeUser,
        body: {
          eduLevelId: String(highLevel!._id),
          eduGradeId: String(grade11!._id),
          eduFieldId: String(humField!._id),
        },
      } as any,
      profUpd.res
    )
    assert.equal(profUpd.out.statusCode, 200)
    const storedProfile = await StudentProfile.findOne({ user: fakeUserId }).lean()
    assert.equal(String(storedProfile?.eduGradeId), String(grade11!._id))
    assert.equal(storedProfile?.studyProgress?.length, 1, 'Changing student grade must preserve prior studyProgress')
    assert.equal(storedProfile?.studyProgress?.[0].stableId, 'e2e_test_chap_temp')

    // 5e. AI Study Planner: grade/field isolation, keyword weakness focus & explicit metadata disclaimer
    const currCall = mockRes()
    await getPlannerCurriculum(
      { query: { gradeId: String(grade10!._id), fieldId: String(expField!._id) }, user: fakeUser } as any,
      currCall.res
    )
    assert.equal(currCall.out.statusCode, 200)
    assert.ok(currCall.out.body.contentLimitationNotice, 'Must include explicit metadata-only limitation notice')
    assert.ok(Array.isArray(currCall.out.body.data.subjects) && currCall.out.body.data.subjects.length > 0)
    assert.ok(
      currCall.out.body.data.subjects.every((s: any) => s.gradeLevels.includes(10)),
      'Curriculum must isolate strictly to selected grade'
    )

    const planCall = mockRes()
    await generateAiStudyPlan(
      {
        user: fakeUser,
        body: {
          gradeId: String(grade10!._id),
          fieldId: String(expField!._id),
          horizon: 'weekly',
          weakTopicQuery: 'یاخته',
          dailyMinutes: 120,
        },
      } as any,
      planCall.res
    )
    assert.equal(planCall.out.statusCode, 200)
    assert.ok(planCall.out.body.data.contentLimitationNotice)
    assert.ok(planCall.out.body.data.sessions.length > 0)
    assert.ok(planCall.out.body.data.weakMatchedCount > 0, 'Weak keyword query should prioritize matching chapters/lessons')

    // 5f. Resources (PDF/StepByStep/Notes/Videos), level-inherited Custom Section (e.g. کاربرد for ابتدایی), and Filtered Question Bank
    const elemLevel = await EduLevel.findOne({ name: 'ابتدایی' }).lean()
    assert.ok(elemLevel, 'Elementary level must exist')
    const elemBook = await EduBook.findOne({ levelId: elemLevel._id, isActive: true }).lean()
    assert.ok(elemBook, 'Elementary active book must exist')

    testCustomSection = await EduCustomSection.create({
      title: 'کاربرد آزمایشی',
      description: 'محتوای کاربردی دوره ابتدایی',
      levelId: elemLevel._id,
      gradeId: null,
      bookId: null,
      order: 1,
      isActive: true,
    })

    const createdRes = await EduResource.insertMany([
      {
        category: 'main_pdf',
        contentType: 'pdf',
        title: 'PDF کتاب آزمایشی',
        fileUrl: '/uploads/edu-resources/sample-book.pdf',
        levelId: elemLevel._id,
        gradeId: elemBook.gradeId,
        bookId: elemBook._id,
        isActive: true,
      },
      {
        category: 'note',
        contentType: 'text',
        title: 'جزوه آزمایشی',
        textContent: 'نکات کلیدی فصل اول',
        levelId: elemLevel._id,
        gradeId: elemBook.gradeId,
        bookId: elemBook._id,
        isActive: true,
      },
      {
        category: 'video',
        contentType: 'video',
        title: 'ویدیو آزمایشی',
        description: 'آموزش تصویری',
        fileUrl: 'https://cdn.example.com/video.mp4',
        durationSeconds: 185,
        levelId: elemLevel._id,
        gradeId: elemBook.gradeId,
        bookId: elemBook._id,
        isActive: true,
      },
      {
        category: 'custom',
        customSectionId: testCustomSection._id,
        contentType: 'pdf',
        title: 'کاربرگ کاربردی',
        fileUrl: '/uploads/edu-resources/karbord.pdf',
        levelId: elemLevel._id,
        isActive: true,
      },
    ])
    createdRes.forEach((r) => testResourceIds.push(r._id))

    const elemDetailCall = mockRes()
    await getStudentBookDetail({ params: { bookId: String(elemBook._id) }, user: fakeUser } as any, elemDetailCall.res)
    assert.equal(elemDetailCall.out.statusCode, 200)
    assert.equal(elemDetailCall.out.body.data.resources.mainPdfs.length >= 1, true)
    assert.equal(elemDetailCall.out.body.data.resources.notes.length >= 1, true)
    assert.equal(elemDetailCall.out.body.data.resources.videos.length >= 1, true)
    const inheritedSec = elemDetailCall.out.body.data.customSections.find(
      (s: any) => String(s._id) === String(testCustomSection._id)
    )
    assert.ok(inheritedSec, 'Level-wide custom section must inherit down to elementary books')
    assert.equal(inheritedSec.items.length, 1)

    // Test getStudentBooks resourceCounts
    const elemBooksCall = mockRes()
    await getStudentBooks(
      { query: { levelId: String(elemLevel._id), gradeId: String(elemBook.gradeId) }, user: fakeUser } as any,
      elemBooksCall.res
    )
    assert.equal(elemBooksCall.out.statusCode, 200)
    const matchedElemBook = elemBooksCall.out.body.data.find((b: any) => String(b._id) === String(elemBook._id))
    assert.equal(matchedElemBook?.resourceCounts?.hasMainPdf, true)
    assert.ok((matchedElemBook?.resourceCounts?.videosCount ?? 0) >= 1)

    // Test Filtered Sample Questions API against a book matched in Question Bank (if local DB has questions)
    const math8 = await EduBook.findOne({ title: /ریاضی/, keywords: { $exists: true }, isActive: true }).lean()
    const targetQBookId = math8?._id || elemBook._id
    const qCall = mockRes()
    await getStudentBookQuestions(
      { params: { bookId: String(targetQBookId) }, query: { type: 'تستی', page: '1', limit: '5' }, user: fakeUser } as any,
      qCall.res
    )
    assert.equal(qCall.out.statusCode, 200)
    assert.ok(Array.isArray(qCall.out.body.data.items))
    assert.ok(Array.isArray(qCall.out.body.data.availableTypes))
  } finally {
    await Promise.all([
      testResourceIds.length > 0 ? EduResource.deleteMany({ _id: { $in: testResourceIds } }) : Promise.resolve(),
      testCustomSection ? EduCustomSection.deleteOne({ _id: testCustomSection._id }) : Promise.resolve(),
      adminTestChap ? EduChapter.deleteOne({ _id: adminTestChap._id }) : Promise.resolve(),
      adminTestBook ? EduBook.deleteOne({ _id: adminTestBook._id }) : Promise.resolve(),
      StudentProfile.deleteMany({ $or: [{ user: fakeUserId }, { studentCode: '09990000001' }] }),
      User.deleteOne({ _id: fakeUserId }),
    ])
  }

  console.log(
    JSON.stringify({
      ok: true,
      seeded: { levels: lvlCount, grades: grdCount, fields: fldCount, books: bkCount, chapters: chCount, lessons: lsCount },
      duplicatesRemoved: importRes.duplicatesInFile.length,
      e2eStudentAndPlannerVerified: true,
    })
  )
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error('❌ eduContent.test failed:', err)
  await mongoose.disconnect()
  process.exit(1)
})
