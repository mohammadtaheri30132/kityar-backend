import mongoose from 'mongoose'
import { logger } from '../utils/logger.js'

export const connectDB = async (): Promise<void> => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/question-cms'
    
    await mongoose.connect(uri)
    
    logger.info('✅ اتصال به دیتابیس MongoDB با موفقیت انجام شد')
    
    mongoose.connection.on('error', (error) => {
      logger.error('❌ خطا در اتصال به دیتابیس:', error)
    })

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ اتصال به دیتابیس قطع شد')
    })

  } catch (error) {
    logger.error('❌ خطا در اتصال به دیتابیس:', error)
    process.exit(1)
  }
}