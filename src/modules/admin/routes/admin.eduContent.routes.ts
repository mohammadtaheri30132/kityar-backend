import path from 'path'
import multer from 'multer'
import { Router } from 'express'
import { protect, adminOnly } from '../../../core/middleware/auth.js'
import { EDU_MEDIA_DIR, EDU_RESOURCES_DIR, ensureEduMediaDir, ensureEduResourcesDir } from '../services/eduMedia.service.js'
import {
  applyJsonImport,
  createBook,
  createChapter,
  createCustomSection,
  createEduResource,
  createField,
  createGrade,
  createLesson,
  createLevel,
  createManualBackup,
  deleteBackup,
  deleteBook,
  deleteChapter,
  deleteCustomSection,
  deleteEduResource,
  deleteField,
  deleteGrade,
  deleteLesson,
  deleteLevel,
  exportJson,
  getAuditLogs,
  getBookDetail,
  getEduStats,
  getEduTree,
  listBackups,
  listCustomSections,
  listEduResources,
  listQuestionBankBooks,
  previewJsonImport,
  removeEntityMedia,
  reorderChapters,
  reorderEntities,
  restoreBackup,
  updateBook,
  updateChapter,
  updateCustomSection,
  updateEduResource,
  updateField,
  updateGrade,
  updateLesson,
  updateLevel,
  uploadEntityMedia,
} from '../controllers/admin.eduContent.controller.js'

ensureEduMediaDir()
ensureEduResourcesDir()

const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, EDU_MEDIA_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png'
    cb(null, `edu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)
  },
})

const imageUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || /\.(jpg|jpeg|png|webp|svg)$/i.test(file.originalname)) {
      cb(null, true)
    } else {
      cb(new Error('فقط فایل‌های تصویری مجاز هستند'))
    }
  },
})

const jsonUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

const resourceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, EDU_RESOURCES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin'
    cb(null, `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)
  },
})

const resourceUpload = multer({
  storage: resourceStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('image/') ||
      /\.(pdf|mp4|mov|mkv|webm|jpg|jpeg|png|webp)$/i.test(file.originalname)
    cb(null, ok)
  },
})

const router = Router()
router.use(protect, adminOnly)

router.get('/stats', getEduStats)
router.get('/tree', getEduTree)
router.get('/books/:id', getBookDetail)

// CRUD taxonomy
router.post('/levels', createLevel)
router.put('/levels/:id', updateLevel)
router.delete('/levels/:id', deleteLevel)

router.post('/grades', createGrade)
router.put('/grades/:id', updateGrade)
router.delete('/grades/:id', deleteGrade)

router.post('/fields', createField)
router.put('/fields/:id', updateField)
router.delete('/fields/:id', deleteField)

router.post('/books', createBook)
router.put('/books/:id', updateBook)
router.delete('/books/:id', deleteBook)

router.post('/books/:bookId/chapters', createChapter)
router.put('/books/:bookId/chapters/reorder', reorderChapters)
router.put('/chapters/:id', updateChapter)
router.delete('/chapters/:id', deleteChapter)

router.post('/chapters/:chapterId/lessons', createLesson)
router.put('/lessons/:id', updateLesson)
router.delete('/lessons/:id', deleteLesson)

router.put('/reorder/:entityType', reorderEntities)

// Import / Export / Backup
router.post('/import/preview', jsonUpload.single('file'), previewJsonImport)
router.post('/import/apply', jsonUpload.single('file'), applyJsonImport)
router.get('/export', exportJson)

router.get('/backups', listBackups)
router.post('/backups', createManualBackup)
router.post('/backups/:id/restore', restoreBackup)
router.delete('/backups/:id', deleteBackup)

// Images, Resources, Custom Sections, Question Bank Links & Audit
router.get('/question-books', listQuestionBankBooks)

router.get('/custom-sections', listCustomSections)
router.post('/custom-sections', createCustomSection)
router.put('/custom-sections/:id', updateCustomSection)
router.delete('/custom-sections/:id', deleteCustomSection)

router.get('/resources', listEduResources)
router.post('/resources', resourceUpload.single('file'), createEduResource)
router.put('/resources/:id', resourceUpload.single('file'), updateEduResource)
router.delete('/resources/:id', deleteEduResource)

router.post('/media/:entityType/:id/upload', imageUpload.single('image'), uploadEntityMedia)
router.delete('/media/:entityType/:id', removeEntityMedia)
router.get('/audit-logs', getAuditLogs)

export default router
