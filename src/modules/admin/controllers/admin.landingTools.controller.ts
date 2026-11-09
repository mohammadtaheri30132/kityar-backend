import { Request, Response } from 'express'
import { LandingToolsSettings } from '../../../core/models/LandingToolsSettings.js'

const DEFAULT_LANDING_TOOL_IDS = [
  'format-converter',
  'photo-scanner',
  'file-compressor',
]

export const getLandingToolsSettings = async (_req: Request, res: Response) => {
  try {
    let settings = await LandingToolsSettings.findOne({ key: 'default' }).lean()

    if (!settings) {
      settings = (await LandingToolsSettings.create({
        key: 'default',
        sectionTitle: 'جعبه‌ابزار کاربردی معلمان در وب',
        sectionSubtitle:
          'مجموعه ابزارهای هوشمند تحت وب برای تبدیل فرمت فایل‌ها، اسکن و شفاف‌سازی برگه‌های امتحانی و کاهش حجم اسناد بدون افت کیفیت.',
        featuredToolIds: DEFAULT_LANDING_TOOL_IDS,
      })) as any
    }

    return res.status(200).json({
      success: true,
      data: settings,
    })
  } catch (error: any) {
    console.error('Error fetching landing tools settings:', error)
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت تنظیمات ابزارهای صفحه اصلی',
      error: error?.message,
    })
  }
}

export const updateLandingToolsSettings = async (req: Request, res: Response) => {
  try {
    const { sectionTitle, sectionSubtitle, featuredToolIds } = req.body

    if (!Array.isArray(featuredToolIds)) {
      return res.status(400).json({
        success: false,
        message: 'لیست شناسه‌های ابزارها باید آرایه باشد',
      })
    }

    const settings = await LandingToolsSettings.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          sectionTitle: sectionTitle?.trim() || 'جعبه‌ابزار کاربردی معلمان در وب',
          sectionSubtitle:
            sectionSubtitle?.trim() ||
            'مجموعه ابزارهای هوشمند تحت وب برای تبدیل فرمت فایل‌ها، اسکن و شفاف‌سازی برگه‌های امتحانی و کاهش حجم اسناد بدون افت کیفیت.',
          featuredToolIds,
        },
      },
      { new: true, upsert: true }
    )

    return res.status(200).json({
      success: true,
      message: 'تنظیمات ابزارهای صفحه اصلی با موفقیت ذخیره شد',
      data: settings,
    })
  } catch (error: any) {
    console.error('Error updating landing tools settings:', error)
    return res.status(500).json({
      success: false,
      message: 'خطا در ذخیره تنظیمات ابزارهای صفحه اصلی',
      error: error?.message,
    })
  }
}

