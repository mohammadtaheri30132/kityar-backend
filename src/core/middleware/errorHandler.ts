import { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import { logger } from '../utils/logger.js'

interface AppError extends Error {
  statusCode?: number
  code?: number
  keyValue?: Record<string, any>
  errors?: Record<string, any>
  value?: any
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = err.statusCode || 500
  let message = err.message || '❌ خطای داخلی سرور'
  let errorCode = 'INTERNAL_ERROR'

  // لاگ کامل خطا
  logger.error(`❌ ${req.method} ${req.originalUrl} - ${err.message}`, {
    stack: err.stack,
    body: req.body,
    params: req.params,
    query: req.query,
  })

  // خطاهای Mongoose Validation
  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400
    errorCode = 'VALIDATION_ERROR'
    const messages = Object.values(err.errors).map((e: any) => e.message)
    message = `⚠️ خطا در اعتبارسنجی: ${messages.join('، ')}`
  }

  // خطای کلید تکراری (Duplicate Key)
  if ((err as any).code === 11000) {
    statusCode = 400
    errorCode = 'DUPLICATE_KEY'
    const field = Object.keys((err as any).keyValue || {}).join('، ')
    message = `⚠️ مقدار "${field}" قبلاً ثبت شده است. لطفاً مقدار دیگری وارد کنید`
  }

  // خطای Cast (شناسه نامعتبر)
  if (err instanceof mongoose.Error.CastError) {
    statusCode = 400
    errorCode = 'INVALID_ID'
    message = `⚠️ شناسه "${err.value}" نامعتبر است`
  }

  // خطای JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401
    errorCode = 'INVALID_TOKEN'
    message = '⛔ توکن نامعتبر است'
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: errorCode,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
  })
}
