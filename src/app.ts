import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url';
// ==================== Core Imports ====================
// آدرس‌ها به پوشه core تغییر کرد
import { connectDB } from './core/config/database.js'
import { requestLogger } from './core/middleware/requestLogger.js'
import { errorHandler } from './core/middleware/errorHandler.js'
import { logger } from './core/utils/logger'
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ==================== Modules Imports ====================
// ایمپورت کل ماژول ادمین به صورت یکجا
import adminRoutes from './modules/admin/admin.routes.js'
import teacherRoutes from './modules/teacher/teacher.routes.js'
import studentRoutes from './modules/student/student.routes.js'
import studentAuthRoutes from './modules/student/routes/student.auth.routes.js';
dotenv.config()

const app = express()
const PORT = process.env.PORT || 5001

// ==================== CORS ====================
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'https://vasehkhoneh.ir',
  'https://www.vasehkhoneh.ir',
  'http://192.168.1.128:5173', // 👈 این IP مک‌بوک شما اضافه شود
  'http://192.168.1.128:5001',
  process.env.CLIENT_URL || '',
].filter(Boolean)

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      console.log('❌ CORS blocked origin:', origin)
      callback(null, true) // موقتاً همه رو قبول کن
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
}))

app.options('*', cors())

// ==================== Middleware ====================
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(requestLogger)

// ==================== Routes ====================
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: '✅ سرور فعال است', timestamp: new Date().toISOString() })
})
app.use(express.static(path.join(process.cwd(), 'public')))
// === اینجا جادوی ماژولار اتفاق میفته ===
// تمام روت‌های ادمین با پیشوند زیر ثبت میشن


// ... کدهای قبلی Express ...

// وقتی کاربر لینک آزمون را باز می‌کند، فایل HTML را به او برمی‌گردانیم
app.get('/exam/join/:examId', (req, res) => {
  // فایل join.html که در پوشه public قرار داده‌اید را می‌خواند و ارسال می‌کند
  res.sendFile(path.join(__dirname, '../public/join.html')); 
});
app.get('/student/exam/start/:examId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/exam-room.html')); 
});
app.use('/api/admin', adminRoutes)
app.use('/api/teacher', teacherRoutes)
app.use('/api/student', studentRoutes)
app.use('/api/student/auth', studentAuthRoutes);
// فردا روزی که بخش موبایل رو ساختی، فقط کافیه این دو خط رو از کامنت دربیاری:
// import mobileRoutes from './modules/mobile/mobile.routes.js'
// app.use('/api/mobile', mobileRoutes)

// ==================== Error Handling ====================
app.use((req, res) => { res.status(404).json({ success: false, message: '⚠️ مسیر یافت نشد' }) })
app.use(errorHandler)

const startServer = async () => {
  try {
    await connectDB()
    app.listen(PORT, () => {
      logger.info(`🚀 سرور روی پورت ${PORT} در حال اجراست`)
      logger.info(`📍 آدرس: http://localhost:${PORT}`)
      logger.info(`🔗 کلاینت: ${allowedOrigins.join(', ')}`)
    })
  } catch (error) {
    logger.error('❌ خطا در راه‌اندازی سرور:', error)
    process.exit(1)
  }
}

startServer()