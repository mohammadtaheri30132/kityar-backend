import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  getPublicForm,
  verifyDeviceSubmission,
  uploadRespondentFile,
  submitPublicForm,
} from '../controllers/public.form.controller.js';

const router = Router();

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
    const safeName = `response-file-${Date.now()}-${Math.round(Math.random() * 1e4)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 40 * 1024 * 1024 }, // 40MB max per file
});

router.get('/:slugOrId', getPublicForm);
router.post('/:slugOrId/verify-device', verifyDeviceSubmission);
router.post('/:slugOrId/upload-file', upload.single('file'), uploadRespondentFile);
router.post('/:slugOrId/submit', submitPublicForm);

export default router;
