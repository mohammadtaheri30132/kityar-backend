import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { Router, Response, NextFunction } from 'express'
import { protect, AuthRequest } from '../../../core/middleware/auth.js'
import {
  getAdminPosts,
  getAdminPostById,
  createAdminPost,
  updateAdminPost,
  toggleAdminPostPublish,
  deleteAdminPost,
  getBlogMediaList,
  uploadBlogMediaFiles,
  updateBlogMediaItem,
  deleteBlogMediaItem,
  getBlogSeoSettings,
  updateBlogSeoSettings,
} from '../controllers/admin.blog.controller.js'

const SUPER_ADMIN_PHONES = ['09137780061', '09919735344']

const superAdminOrAdminOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const phone = (req.user as any)?.phoneNumber || req.user?.username || ''
  if (req.user && (req.user.role === 'admin' || SUPER_ADMIN_PHONES.includes(phone))) {
    next()
    return
  }
  res.status(403).json({
    success: false,
    message: '⛔ فقط مدیران ارشد به مدیریت وبلاگ و سئو دسترسی دارند',
  })
}

const blogUploadDir = path.join(process.cwd(), 'public', 'uploads', 'blog')
if (!fs.existsSync(blogUploadDir)) {
  fs.mkdirSync(blogUploadDir, { recursive: true })
}

const blogMediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, blogUploadDir),
  filename: (_req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase()
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(rawExt)
      ? rawExt
      : '.jpg'
    const unique = `blog_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${safeExt}`
    cb(null, unique)
  },
})

const blogMediaUpload = multer({
  storage: blogMediaStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per image
  fileFilter: (_req, file, cb) => {
    const allowedExt = /\.(jpg|jpeg|png|webp|gif|avif)$/i
    const allowedMime = /^image\/(jpeg|jpg|png|webp|gif|avif)$/i
    if (allowedExt.test(file.originalname) && allowedMime.test(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('فرمت فایل مجاز نیست. فقط تصاویر JPG, PNG, WebP, GIF مجاز هستند.'))
    }
  },
})

const router = Router()

router.use(protect, superAdminOrAdminOnly)

// Posts
router.get('/posts', getAdminPosts)
router.get('/posts/:id', getAdminPostById)
router.post('/posts', createAdminPost)
router.put('/posts/:id', updateAdminPost)
router.patch('/posts/:id/publish', toggleAdminPostPublish)
router.delete('/posts/:id', deleteAdminPost)

// WordPress-style Media Library
router.get('/media', getBlogMediaList)
router.post('/media/upload', blogMediaUpload.array('files', 10), uploadBlogMediaFiles)
router.put('/media/:id', updateBlogMediaItem)
router.delete('/media/:id', deleteBlogMediaItem)

// Global SEO Settings
router.get('/seo-settings', getBlogSeoSettings)
router.put('/seo-settings', updateBlogSeoSettings)

export default router

