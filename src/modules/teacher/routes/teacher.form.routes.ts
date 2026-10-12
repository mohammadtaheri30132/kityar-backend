import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  getTeacherForms,
  getFormTemplates,
  createForm,
  getFormById,
  updateForm,
  duplicateForm,
  updateFormStatus,
  deleteForm,
  getFormResponses,
  getFormResponseById,
  gradeFormResponse,
  getFormAnalytics,
  exportFormResponsesCsv,
  exportFormResponsesJson,
  uploadFormMedia,
} from '../controllers/teacher.form.controller.js';
import { protect, teacherOnly } from '../../../core/middleware/auth.js';

const router = Router();

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `form-media-${Date.now()}-${Math.round(Math.random() * 1e4)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
});

// Protect all teacher form builder routes
router.use(protect, teacherOnly);

// Templates
router.get('/templates', getFormTemplates);

// Media upload
router.post('/upload-media', upload.single('file'), uploadFormMedia);

// CRUD
router.get('/', getTeacherForms);
router.post('/', createForm);
router.get('/:id', getFormById);
router.put('/:id', updateForm);
router.delete('/:id', deleteForm);

// Status & Duplicate
router.post('/:id/duplicate', duplicateForm);
router.post('/:id/status', updateFormStatus);

// Responses & Grading
router.get('/:id/responses', getFormResponses);
router.get('/:id/responses/:responseId', getFormResponseById);
router.put('/:id/responses/:responseId/grade', gradeFormResponse);

// Analytics & Exports
router.get('/:id/analytics', getFormAnalytics);
router.get('/:id/export/csv', exportFormResponsesCsv);
router.get('/:id/export/json', exportFormResponsesJson);

export default router;
