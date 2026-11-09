import { Request, Response, NextFunction } from 'express'
import { protect, AuthRequest } from '../../../core/middleware/auth.js'
import { IUser } from '../../../core/models/User.js'

export interface ClassroomUserContext {
  userId: string
  role: 'teacher' | 'student' | 'admin'
  name: string
  phoneNumber?: string
}

export class AuthAdapter {
  /**
   * Express middleware for protecting classroom routes
   */
  static authenticate = protect

  /**
   * Safely extract typed user context from request
   */
  static getUser(req: Request): ClassroomUserContext | null {
    const authReq = req as AuthRequest
    const user = authReq.user

    if (!user || !user._id) {
      return null
    }

    const name =
      (user as any).fullName ||
      (user as any).name ||
      `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
      user.username ||
      'کاربر'

    return {
      userId: user._id.toString(),
      role: (user.role as 'teacher' | 'student' | 'admin') || 'student',
      name,
      phoneNumber: user.phoneNumber,
    }
  }
}

