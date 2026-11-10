import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect, teacherOnly } from '../../../core/middleware/auth.js';
import * as communityController from '../controllers/teacher.community.controller.js';

const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'community');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `comm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 35 * 1024 * 1024 }, // 35MB limit (supports up to 30MB video)
});

const router = Router();

// Categories (Accessible without or with token)
router.get('/categories', communityController.getCategories);

// Questions
router.get('/questions', protect, communityController.getQuestions);
router.get('/my-questions', protect, communityController.getMyQuestions);
router.post('/questions', protect, communityController.createQuestion);
router.get('/questions/:id', protect, communityController.getQuestionById);
router.put('/questions/:id', protect, communityController.updateQuestion);
router.delete('/questions/:id', protect, communityController.deleteQuestion);
router.post('/questions/:id/like', protect, communityController.toggleLikeQuestion);

// Answers
router.post('/questions/:id/answers', protect, communityController.createAnswer);
router.put('/answers/:answerId', protect, communityController.updateAnswer);
router.delete('/answers/:answerId', protect, communityController.deleteAnswer);
router.post('/answers/:answerId/like', protect, communityController.toggleLikeAnswer);
router.post('/answers/:answerId/accept', protect, communityController.toggleAcceptAnswer);
router.post('/questions/:id/answers/:answerId/accept', protect, communityController.toggleAcceptAnswer);

// Posts
router.get('/posts', protect, communityController.getPosts);
router.post('/posts', protect, communityController.createPost);
router.get('/posts/:id', protect, communityController.getPostById);
router.put('/posts/:id', protect, communityController.updatePost);
router.delete('/posts/:id', protect, communityController.deletePost);
router.post('/posts/:id/like', protect, communityController.toggleLikePost);
router.post('/posts/:id/save', protect, communityController.toggleSavePost);
router.post('/posts/:id/bookmark', protect, communityController.toggleSavePost);

// Comments
router.post('/posts/:id/comments', protect, communityController.createComment);
router.delete('/comments/:commentId', protect, communityController.deleteComment);

// Reporting
router.post('/report', protect, communityController.submitReport);

// Attachment / Media Upload (with automatic lossless/high-quality image compression)
router.post('/upload', protect, upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'هیچ فایلی ارسال نشد' });
    return;
  }

  const isImage = req.file.mimetype.startsWith('image/');
  const isVideo = req.file.mimetype.startsWith('video/');

  // Compress image on server if it is an image
  if (isImage) {
    try {
      const sharp = (await import('sharp')).default;
      const originalPath = req.file.path;
      const parsed = path.parse(originalPath);
      const optimizedPath = path.join(parsed.dir, `opt_${parsed.base}`);

      await sharp(originalPath)
        .rotate()
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true, mozjpeg: true })
        .toFile(optimizedPath);

      const origSize = fs.statSync(originalPath).size;
      const optSize = fs.statSync(optimizedPath).size;

      if (optSize < origSize) {
        fs.unlinkSync(originalPath);
        fs.renameSync(optimizedPath, originalPath);
      } else {
        fs.unlinkSync(optimizedPath);
      }
    } catch (compressErr) {
      // Fallback gracefully to original file if compression encounters any issue
    }
  }

  const fileUrl = `/uploads/community/${req.file.filename}`;
  const finalSize = fs.existsSync(req.file.path) ? fs.statSync(req.file.path).size : req.file.size;

  res.json({
    success: true,
    data: {
      url: fileUrl,
      type: isImage ? 'image' : isVideo ? 'video' : 'file',
      name: req.file.originalname,
      size: finalSize,
    },
  });
});

export default router;
