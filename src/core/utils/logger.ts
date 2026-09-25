import winston from 'winston'

const { combine, timestamp, printf, colorize, errors } = winston.format

// فرمت سفارشی برای لاگ‌های فارسی
const customFormat = printf(({ level, message, timestamp, stack }) => {
  if (stack) {
    return `${timestamp} ${level}: ${message}\n${stack}`
  }
  return `${timestamp} ${level}: ${message}`
})

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    customFormat
  ),
  transports: [
    // لاگ در کنسول با رنگ
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        customFormat
      ),
    }),
    // لاگ در فایل (برای محیط production)
    ...(process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
})