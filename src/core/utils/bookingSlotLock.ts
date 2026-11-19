import mongoose, { Schema } from 'mongoose'

const bookingLockSchema = new Schema({
  lockKey: { type: String, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now, expires: 15 },
})

const BookingLockModel = mongoose.model('BookingSlotLock', bookingLockSchema)

// Per-teacher in-process queue ensures strict serialization within Node event loop
const localQueues = new Map<string, Promise<void>>()

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Serializes concurrent booking creation per teacherId (both in-process and across workers via MongoDB).
 */
export async function withTeacherBookingLock<T>(teacherId: string, fn: () => Promise<T>): Promise<T> {
  const lockKey = `teacher_booking_${teacherId}`
  const prev = localQueues.get(lockKey) || Promise.resolve()

  let releaseLocal!: () => void
  const current = new Promise<void>((resolve) => {
    releaseLocal = resolve
  })
  const chained = prev.then(() => current)
  localQueues.set(lockKey, chained)

  await prev

  let acquiredMongoLock = false
  try {
    if (mongoose.connection.readyState === 1) {
      for (let attempt = 0; attempt < 25; attempt++) {
        try {
          await BookingLockModel.create({ lockKey, createdAt: new Date() })
          acquiredMongoLock = true
          break
        } catch (err: any) {
          if (err?.code === 11000) {
            await sleep(40)
            continue
          }
          break
        }
      }
    }
    return await fn()
  } finally {
    if (acquiredMongoLock && mongoose.connection.readyState === 1) {
      await BookingLockModel.deleteOne({ lockKey }).catch(() => {})
    }
    releaseLocal()
    if (localQueues.get(lockKey) === chained) {
      localQueues.delete(lockKey)
    }
  }
}
