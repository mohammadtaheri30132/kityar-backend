import fs from 'fs'
import path from 'path'
import { Response } from 'express'
import { AuthRequest } from '../../../core/middleware/auth.js'
import { Post } from '../../../core/models/Post.js'
import { BlogMedia } from '../../../core/models/BlogMedia.js'
import { BlogSeoSettings } from '../../../core/models/BlogSeoSettings.js'

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSlug(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[؟?!،,.;:'"()[\]{}<>@#$%^&*+=~`|\\/]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function estimateReadingTime(content: string): number {
  const words = stripHtml(content).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

async function ensureSettings(key = 'default') {
  let settings = await BlogSeoSettings.findOne({ key })
  if (!settings) {
    if (key === 'nokita') {
      settings = await BlogSeoSettings.create({
        key: 'nokita',
        blogTitle: 'وبلاگ و راهنمای درسی دانش‌آموزان نوکیتا',
        blogSubtitle:
          'جدیدترین روش‌های مطالعه، برنامه‌ریزی درسی، حل تمرین و موفقیت در امتحانات ویژه دانش‌آموزان ایران',
        siteNameSuffix: 'نوکیتا',
        defaultMetaDescription:
          'مجله تخصصی برنامه‌ریزی و پیشرفت درسی نوکیتا؛ مرجع مقالات روش‌های مطالعه، آمادگی امتحانات، خلاصه درس و موفقیت تحصیلی دانش‌آموزان.',
        defaultKeywords: [
          'وبلاگ دانش آموزی',
          'برنامه‌ریزی درسی',
          'روش مطالعه هوشمند',
          'موفقیت در امتحانات',
          'پیشرفت تحصیلی',
          'نوکیتا',
        ],
        defaultOgImage: '/images/nokita_og.png',
        categories: [
          'روش‌های مطالعه',
          'برنامه‌ریزی و مدیریت زمان',
          'آمادگی امتحانات',
          'انگیزشی و تمرکز',
          'راهنمای کنکور',
        ],
        organizationName: 'سامانه هوشمند دانش‌آموزی نوکیتا',
        ctaBoxTitle: 'می‌خواهی نمراتت پیشرفت کنه و با برنامه درس بخونی؟',
        ctaBoxSubtitle:
          'اپلیکیشن نوکیتا رو دانلود کن تا به تکالیف، آزمون‌ها و کارنامه کلاسی دسترسی داشته باشی.',
        ctaBoxButtonText: 'دانلود اپلیکیشن نوکیتا',
        ctaBoxButtonLink: '/download',
      })
    } else {
      settings = await BlogSeoSettings.create({ key: 'default' })
    }
  }
  return settings
}

// ==================== POSTS CRUD ====================

export const getAdminPosts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search = '', category = '', status = 'all', targetAudience = 'all_targets' } = req.query as Record<string, string>
    const filter: Record<string, any> = {}

    if (status === 'published') filter.isPublished = true
    else if (status === 'draft') filter.isPublished = false

    if (category && category !== 'all') {
      filter.category = category
    }

    if (targetAudience && targetAudience !== 'all_targets') {
      filter.targetAudience = targetAudience
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ title: regex }, { slug: regex }, { excerpt: regex }, { tags: regex }]
    }

    const [posts, totalCount, publishedCount, viewsAgg] = await Promise.all([
      Post.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .select('-content')
        .lean(),
      Post.countDocuments(),
      Post.countDocuments({ isPublished: true }),
      Post.aggregate([{ $group: { _id: null, totalViews: { $sum: '$views' }, avgSeo: { $avg: '$seo.seoScore' } } }]),
    ])

    res.json({
      success: true,
      data: posts,
      stats: {
        total: totalCount,
        published: publishedCount,
        drafts: Math.max(0, totalCount - publishedCount),
        totalViews: viewsAgg[0]?.totalViews || 0,
        avgSeoScore: Math.round(viewsAgg[0]?.avgSeo || 0),
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در دریافت مقالات وبلاگ', error: error.message })
  }
}

export const getAdminPostById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await Post.findById(req.params.id).lean()
    if (!post) {
      res.status(404).json({ success: false, message: 'مقاله یافت نشد' })
      return
    }
    res.json({ success: true, data: post })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در دریافت جزئیات مقاله', error: error.message })
  }
}

export const createAdminPost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      title,
      slug,
      excerpt,
      content,
      coverImage = '',
      coverImageAlt = '',
      category = 'آموزشی',
      tags = [],
      author,
      readingTime,
      isFeatured = false,
      isPublished = true,
      publishedAt,
      targetAudience = 'kitayar',
      seo = {},
      faqs = [],
    } = req.body

    if (!title || !String(title).trim()) {
      res.status(400).json({ success: false, message: 'عنوان مقاله الزامی است' })
      return
    }
    if (!content || !stripHtml(String(content))) {
      res.status(400).json({ success: false, message: 'محتوای مقاله نمی‌تواند خالی باشد' })
      return
    }

    let finalSlug = normalizeSlug(slug || title)
    if (!finalSlug) finalSlug = `post-${Date.now()}`

    const existing = await Post.findOne({ slug: finalSlug })
    if (existing) {
      finalSlug = `${finalSlug}-${Math.random().toString(36).substring(2, 6)}`
    }

    const plainText = stripHtml(String(content))
    const finalExcerpt =
      (excerpt && String(excerpt).trim()) ||
      plainText.slice(0, 180) + (plainText.length > 180 ? '...' : '')

    const cleanTags = Array.isArray(tags)
      ? tags.map((t) => String(t).trim()).filter(Boolean)
      : String(tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)

    const cleanFaqs = Array.isArray(faqs)
      ? faqs
          .filter((f) => f && String(f.question || '').trim() && String(f.answer || '').trim())
          .map((f) => ({ question: String(f.question).trim(), answer: String(f.answer).trim() }))
      : []

    const post = await Post.create({
      title: String(title).trim(),
      slug: finalSlug,
      excerpt: finalExcerpt,
      content: String(content),
      coverImage: String(coverImage || '').trim(),
      coverImageAlt: String(coverImageAlt || '').trim(),
      category: String(category || 'آموزشی').trim(),
      tags: cleanTags,
      author: {
        name: author?.name?.trim() || req.user?.fullName || 'تحریریه کیتایار',
        role: author?.role?.trim() || 'کارشناس آموزش و یادگیری',
        avatar: author?.avatar || '',
      },
      readingTime: Number(readingTime) > 0 ? Number(readingTime) : estimateReadingTime(content),
      isFeatured: Boolean(isFeatured),
      isPublished: Boolean(isPublished),
      publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
      targetAudience: ['kitayar', 'nokita', 'all'].includes(targetAudience) ? targetAudience : 'kitayar',
      seo: {
        focusKeyword: String(seo?.focusKeyword || '').trim(),
        metaTitle: String(seo?.metaTitle || '').trim(),
        metaDescription: String(seo?.metaDescription || '').trim(),
        canonicalUrl: String(seo?.canonicalUrl || '').trim(),
        ogTitle: String(seo?.ogTitle || '').trim(),
        ogDescription: String(seo?.ogDescription || '').trim(),
        ogImage: String(seo?.ogImage || '').trim(),
        robotsNoIndex: Boolean(seo?.robotsNoIndex),
        robotsNoFollow: Boolean(seo?.robotsNoFollow),
        schemaType: ['BlogPosting', 'Article', 'NewsArticle'].includes(seo?.schemaType)
          ? seo.schemaType
          : 'BlogPosting',
        seoScore: Number(seo?.seoScore) || 0,
      },
      faqs: cleanFaqs,
    })

    // Ensure category is registered in global settings if new
    if (post.category) {
      await BlogSeoSettings.updateOne(
        { key: 'default' },
        { $addToSet: { categories: post.category } },
        { upsert: true }
      )
    }

    res.status(201).json({ success: true, message: 'مقاله با موفقیت ذخیره شد', data: post })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در ایجاد مقاله', error: error.message })
  }
}

export const updateAdminPost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await Post.findById(req.params.id)
    if (!existing) {
      res.status(404).json({ success: false, message: 'مقاله یافت نشد' })
      return
    }

    const {
      title,
      slug,
      excerpt,
      content,
      coverImage,
      coverImageAlt,
      category,
      tags,
      author,
      readingTime,
      isFeatured,
      isPublished,
      publishedAt,
      targetAudience,
      seo,
      faqs,
    } = req.body

    if (title !== undefined) existing.title = String(title).trim()

    if (slug !== undefined && String(slug).trim()) {
      const normalized = normalizeSlug(String(slug))
      if (normalized && normalized !== existing.slug) {
        const collision = await Post.findOne({ slug: normalized, _id: { $ne: existing._id } })
        if (collision) {
          res.status(400).json({ success: false, message: 'این نامک (Slug) قبلاً برای مقاله دیگری ثبت شده است' })
          return
        }
        existing.slug = normalized
      }
    }

    if (content !== undefined) {
      existing.content = String(content)
      if (!readingTime) {
        existing.readingTime = estimateReadingTime(existing.content)
      }
    }

    if (excerpt !== undefined) {
      const trimmedExcerpt = String(excerpt).trim()
      if (trimmedExcerpt) {
        existing.excerpt = trimmedExcerpt
      } else {
        const plain = stripHtml(existing.content)
        existing.excerpt = plain.slice(0, 180) + (plain.length > 180 ? '...' : '')
      }
    }

    if (coverImage !== undefined) existing.coverImage = String(coverImage).trim()
    if (coverImageAlt !== undefined) existing.coverImageAlt = String(coverImageAlt).trim()
    if (category !== undefined && String(category).trim()) {
      existing.category = String(category).trim()
      await BlogSeoSettings.updateOne(
        { key: 'default' },
        { $addToSet: { categories: existing.category } },
        { upsert: true }
      )
    }

    if (tags !== undefined) {
      existing.tags = Array.isArray(tags)
        ? tags.map((t) => String(t).trim()).filter(Boolean)
        : String(tags || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
    }

    if (author) {
      existing.author = {
        name: author.name?.trim() || existing.author?.name || 'تحریریه کیتایار',
        role: author.role?.trim() || existing.author?.role || 'کارشناس آموزش',
        avatar: author.avatar !== undefined ? author.avatar : existing.author?.avatar || '',
      }
    }

    if (readingTime !== undefined && Number(readingTime) > 0) {
      existing.readingTime = Number(readingTime)
    }
    if (isFeatured !== undefined) existing.isFeatured = Boolean(isFeatured)
    if (isPublished !== undefined) existing.isPublished = Boolean(isPublished)
    if (publishedAt) existing.publishedAt = new Date(publishedAt)
    if (targetAudience !== undefined && ['kitayar', 'nokita', 'all'].includes(targetAudience)) {
      existing.targetAudience = targetAudience
    }

    if (seo !== undefined) {
      existing.seo = {
        focusKeyword: String(seo.focusKeyword ?? existing.seo?.focusKeyword ?? '').trim(),
        metaTitle: String(seo.metaTitle ?? existing.seo?.metaTitle ?? '').trim(),
        metaDescription: String(seo.metaDescription ?? existing.seo?.metaDescription ?? '').trim(),
        canonicalUrl: String(seo.canonicalUrl ?? existing.seo?.canonicalUrl ?? '').trim(),
        ogTitle: String(seo.ogTitle ?? existing.seo?.ogTitle ?? '').trim(),
        ogDescription: String(seo.ogDescription ?? existing.seo?.ogDescription ?? '').trim(),
        ogImage: String(seo.ogImage ?? existing.seo?.ogImage ?? '').trim(),
        robotsNoIndex: Boolean(seo.robotsNoIndex ?? existing.seo?.robotsNoIndex ?? false),
        robotsNoFollow: Boolean(seo.robotsNoFollow ?? existing.seo?.robotsNoFollow ?? false),
        schemaType: ['BlogPosting', 'Article', 'NewsArticle'].includes(seo.schemaType)
          ? seo.schemaType
          : existing.seo?.schemaType || 'BlogPosting',
        seoScore: Number(seo.seoScore ?? existing.seo?.seoScore ?? 0),
      }
    }

    if (faqs !== undefined && Array.isArray(faqs)) {
      existing.faqs = faqs
        .filter((f) => f && String(f.question || '').trim() && String(f.answer || '').trim())
        .map((f) => ({ question: String(f.question).trim(), answer: String(f.answer).trim() }))
    }

    await existing.save()
    res.json({ success: true, message: 'تغییرات مقاله ذخیره شد', data: existing })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در ویرایش مقاله', error: error.message })
  }
}

export const toggleAdminPostPublish = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await Post.findById(req.params.id)
    if (!post) {
      res.status(404).json({ success: false, message: 'مقاله یافت نشد' })
      return
    }
    post.isPublished = !post.isPublished
    if (post.isPublished && !post.publishedAt) {
      post.publishedAt = new Date()
    }
    await post.save()
    res.json({
      success: true,
      message: post.isPublished ? 'مقاله در وب‌سایت منتشر شد' : 'مقاله به حالت پیش‌نویس منتقل شد',
      data: { _id: post._id, isPublished: post.isPublished },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت انتشار', error: error.message })
  }
}

export const deleteAdminPost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deleted = await Post.findByIdAndDelete(req.params.id)
    if (!deleted) {
      res.status(404).json({ success: false, message: 'مقاله یافت نشد' })
      return
    }
    res.json({ success: true, message: 'مقاله حذف شد' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در حذف مقاله', error: error.message })
  }
}

// ==================== WORDPRESS MEDIA LIBRARY ====================

export const getBlogMediaList = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search = '', page = '1', limit = '40' } = req.query as Record<string, string>
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 40))

    const filter: Record<string, any> = {}
    if (search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ title: regex }, { alt: regex }, { originalName: regex }, { caption: regex }]
    }

    const [items, total, missingAltCount, sizeAgg] = await Promise.all([
      BlogMedia.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      BlogMedia.countDocuments(filter),
      BlogMedia.countDocuments({ $or: [{ alt: '' }, { alt: { $exists: false } }] }),
      BlogMedia.aggregate([{ $group: { _id: null, totalBytes: { $sum: '$size' } } }]),
    ])

    res.json({
      success: true,
      data: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
      stats: {
        totalFiles: await BlogMedia.countDocuments(),
        missingAltCount,
        totalBytes: sizeAgg[0]?.totalBytes || 0,
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در دریافت کتابخانه رسانه', error: error.message })
  }
}

export const uploadBlogMediaFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : [])
    if (!files.length) {
      res.status(400).json({ success: false, message: 'هیچ فایلی انتخاب نشده است' })
      return
    }

    const created = await Promise.all(
      files.map(async (file) => {
        const decodedOriginal = Buffer.from(file.originalname, 'latin1').toString('utf8')
        const cleanBase = path
          .basename(decodedOriginal, path.extname(decodedOriginal))
          .replace(/[-_]+/g, ' ')
          .trim()

        return BlogMedia.create({
          filename: file.filename,
          originalName: decodedOriginal,
          url: `/uploads/blog/${file.filename}`,
          mimeType: file.mimetype,
          size: file.size,
          title: cleanBase || 'تصویر وبلاگ',
          alt: cleanBase || '',
          caption: '',
          uploadedBy: req.user?._id,
        })
      })
    )

    res.status(201).json({
      success: true,
      message: `${created.length} فایل با موفقیت در کتابخانه رسانه بارگذاری شد`,
      data: created,
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در بارگذاری تصویر', error: error.message })
  }
}

export const updateBlogMediaItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const media = await BlogMedia.findById(req.params.id)
    if (!media) {
      res.status(404).json({ success: false, message: 'رسانه یافت نشد' })
      return
    }

    const { title, alt, caption } = req.body
    if (title !== undefined) media.title = String(title).trim()
    if (alt !== undefined) media.alt = String(alt).trim()
    if (caption !== undefined) media.caption = String(caption).trim()

    await media.save()
    res.json({ success: true, message: 'مشخصات سئو تصویر بروزرسانی شد', data: media })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در ویرایش مشخصات تصویر', error: error.message })
  }
}

export const deleteBlogMediaItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const media = await BlogMedia.findById(req.params.id)
    if (!media) {
      res.status(404).json({ success: false, message: 'فایل مورد نظر یافت نشد' })
      return
    }

    const safeFilename = path.basename(media.filename)
    const filePath = path.join(process.cwd(), 'public', 'uploads', 'blog', safeFilename)
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch {
        // Ignore unlink errors if file was already removed
      }
    }

    await media.deleteOne()
    res.json({ success: true, message: 'تصویر از کتابخانه رسانه حذف شد' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در حذف تصویر', error: error.message })
  }
}

// ==================== GLOBAL BLOG SEO SETTINGS ====================

export const getBlogSeoSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const target = req.query.target === 'nokita' ? 'nokita' : 'default'
    const settings = await ensureSettings(target)

    const postFilter = target === 'nokita' ? { targetAudience: { $in: ['nokita', 'all'] } } : { targetAudience: { $in: ['kitayar', 'all', undefined] } }

    const [
      totalPublished,
      missingFocusKeyword,
      missingMetaDescription,
      noIndexCount,
      missingMediaAlt,
    ] = await Promise.all([
      Post.countDocuments({ isPublished: true, ...postFilter }),
      Post.countDocuments({
        isPublished: true,
        ...postFilter,
        $or: [{ 'seo.focusKeyword': '' }, { 'seo.focusKeyword': { $exists: false } }],
      }),
      Post.countDocuments({
        isPublished: true,
        ...postFilter,
        $or: [{ 'seo.metaDescription': '' }, { 'seo.metaDescription': { $exists: false } }],
      }),
      Post.countDocuments({ 'seo.robotsNoIndex': true, ...postFilter }),
      BlogMedia.countDocuments({ $or: [{ alt: '' }, { alt: { $exists: false } }] }),
    ])

    res.json({
      success: true,
      data: settings,
      audit: {
        totalPublished,
        missingFocusKeyword,
        missingMetaDescription,
        noIndexCount,
        missingMediaAlt,
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات سئو وبلاگ', error: error.message })
  }
}

export const updateBlogSeoSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const target = (req.body.target || req.query.target) === 'nokita' ? 'nokita' : 'default'
    const settings = await ensureSettings(target)
    const body = req.body || {}

    if (body.blogTitle !== undefined) settings.blogTitle = String(body.blogTitle).trim()
    if (body.blogSubtitle !== undefined) settings.blogSubtitle = String(body.blogSubtitle).trim()
    if (body.titleSeparator !== undefined) settings.titleSeparator = String(body.titleSeparator).trim() || '|'
    if (body.siteNameSuffix !== undefined) settings.siteNameSuffix = String(body.siteNameSuffix).trim()
    if (body.defaultMetaDescription !== undefined) {
      settings.defaultMetaDescription = String(body.defaultMetaDescription).trim()
    }
    if (body.defaultKeywords !== undefined) {
      settings.defaultKeywords = Array.isArray(body.defaultKeywords)
        ? body.defaultKeywords.map((k: string) => String(k).trim()).filter(Boolean)
        : String(body.defaultKeywords)
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean)
    }
    if (body.defaultOgImage !== undefined) settings.defaultOgImage = String(body.defaultOgImage).trim()
    if (body.googleSiteVerification !== undefined) {
      settings.googleSiteVerification = String(body.googleSiteVerification).trim()
    }
    if (body.bingSiteVerification !== undefined) {
      settings.bingSiteVerification = String(body.bingSiteVerification).trim()
    }
    if (body.defaultRobotsIndex !== undefined) settings.defaultRobotsIndex = Boolean(body.defaultRobotsIndex)
    if (body.defaultRobotsFollow !== undefined) settings.defaultRobotsFollow = Boolean(body.defaultRobotsFollow)
    if (body.categories !== undefined && Array.isArray(body.categories)) {
      settings.categories = body.categories.map((c: string) => String(c).trim()).filter(Boolean)
    }
    if (body.organizationName !== undefined) settings.organizationName = String(body.organizationName).trim()
    if (body.ctaBoxTitle !== undefined) settings.ctaBoxTitle = String(body.ctaBoxTitle).trim()
    if (body.ctaBoxSubtitle !== undefined) settings.ctaBoxSubtitle = String(body.ctaBoxSubtitle).trim()
    if (body.ctaBoxButtonText !== undefined) settings.ctaBoxButtonText = String(body.ctaBoxButtonText).trim()
    if (body.ctaBoxButtonLink !== undefined) settings.ctaBoxButtonLink = String(body.ctaBoxButtonLink).trim()

    await settings.save()
    res.json({ success: true, message: 'تنظیمات کلی سئو وبلاگ با موفقیت ذخیره شد', data: settings })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'خطا در ذخیره تنظیمات سئو', error: error.message })
  }
}

