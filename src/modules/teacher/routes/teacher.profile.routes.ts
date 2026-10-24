import { Router } from 'express'
import {
  getProfile,
  updateProfile,
  updateResume,
  addExperience,
  deleteExperience,
  addEducation,
  deleteEducation,
  updateSkills,
  addCertificate,
  deleteCertificate,
  addHonor,
  deleteHonor,
} from '../controllers/teacher.profile.controller.js'
import { protect, teacherOnly } from '../../../core/middleware/auth.js'

const router = Router()

// اعمال میدلورها: احراز هویت و دسترسی معلم
router.use(protect, teacherOnly)

// دریافت و ویرایش کلی اطلاعات پروفایل
router.get('/', getProfile)
router.put('/', updateProfile)

// مدیریت یکپارچه رزومه
router.put('/resume', updateResume)

// سوابق تدریس
router.post('/resume/experience', addExperience)
router.delete('/resume/experience/:itemId', deleteExperience)

// مدارک تحصیلی
router.post('/resume/education', addEducation)
router.delete('/resume/education/:itemId', deleteEducation)

// مهارت‌ها
router.put('/resume/skills', updateSkills)

// گواهینامه‌ها و دوره‌های ضمن خدمت
router.post('/resume/certificate', addCertificate)
router.delete('/resume/certificate/:itemId', deleteCertificate)

// افتخارات و مقالات
router.post('/resume/honor', addHonor)
router.delete('/resume/honor/:itemId', deleteHonor)

export default router