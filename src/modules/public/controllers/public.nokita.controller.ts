import { Request, Response } from 'express';
import { NokitaSiteSettings } from '../../../core/models/NokitaSiteSettings.js';
import { Post } from '../../../core/models/Post.js';
import { BlogSeoSettings } from '../../../core/models/BlogSeoSettings.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * اطمینان از وجود تنظیمات پیش‌فرض سایت نوکیتا در دیتابیس
 */
async function ensureNokitaSettings() {
  let settings = await NokitaSiteSettings.findOne({ key: 'default' });
  if (!settings) {
    settings = await NokitaSiteSettings.create({ key: 'default' });
  }
  return settings;
}

async function ensureNokitaSeedArticles() {
  const count = await Post.countDocuments({ targetAudience: { $in: ['nokita', 'all'] } });
  if (count > 0) return;

  const articles = [
    {
      title: 'روش مطالعه پومودورو: چگونه ۲۵ دقیقه‌ای بازدهی درس خواندن را دو برابر کنیم؟',
      slug: 'روش-مطالعه-پومودورو-برای-دانش-آموزان',
      excerpt:
        'آشنایی با تکنیک مدیریت زمان پومودورو برای دانش‌آموزان؛ فواصل تمرکز ۲۵ دقیقه‌ای، استراحت‌های کوتاه و راهکارهای جلوگیری از خستگی ذهنی.',
      content: `<h2>تکنیک پومودورو چیست؟</h2><p>تکنیک پومودورو یک روش اثبات‌شده برای مدیریت زمان است که به شما کمک می‌کند کارهای درسی خود را به بازه‌های زمانی ۲۵ دقیقه‌ای تقسیم کنید. بعد از هر ۲۵ دقیقه، ۵ دقیقه استراحت می‌کنید.</p><h3>مراحل اجرای پومودورو در درس خواندن</h3><ul><li>یک درس یا مبحث مشخص را انتخاب کنید.</li><li>تایمر را روی ۲۵ دقیقه تنظیم نمایید.</li><li>تمام وسایل حواس‌پرت‌کن مثل گوشی را کنار بگذارید.</li><li>با تمرکز کامل مطالعه کنید تا زنگ به صدا درآید.</li><li>۵ دقیقه استراحت کوتاه داشته باشید.</li></ul>`,
      coverImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80',
      coverImageAlt: 'روش مطالعه پومودورو دانش‌آموزان',
      category: 'روش‌های مطالعه',
      tags: ['پومودورو', 'برنامه‌ریزی درسی', 'تمرکز', 'موفقیت تحصیلی'],
      author: { name: 'تیم مشاوره نوکیتا', role: 'مشاور تحصیلی' },
      readingTime: 4,
      isFeatured: true,
      isPublished: true,
      publishedAt: new Date(),
      targetAudience: 'nokita',
      seo: {
        focusKeyword: 'روش مطالعه پومودورو',
        metaTitle: 'روش مطالعه پومودورو برای دانش‌آموزان | نوکیتا',
        metaDescription: 'روش پومودورو در برنامه‌ریزی تحصیلی دانش‌آموزان برای افزایش تمرکز و جلوگیری از افت بازدهی هنگام درس خواندن.',
        canonicalUrl: 'https://nokita.kitayar.ir/blog/روش-مطالعه-پومودورو-برای-دانش-آموزان',
        ogTitle: 'روش مطالعه پومودورو برای دانش‌آموزان',
        ogDescription: 'تکنیک پومودورو برای درس خواندن با بالاترین بازدهی',
        ogImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80',
        robotsNoIndex: false,
        robotsNoFollow: false,
        schemaType: 'Article',
        seoScore: 92,
      },
    },
    {
      title: 'راهنمای جامع برنامه‌ریزی درسی و آمادگی شب امتحان',
      slug: 'چگونه-برای-امتحانات-نهایی-و-کلاسی-برنامه-ریزی-کنیم',
      excerpt:
        'بهترین استراتژی‌های مرور، خلاصه‌نویسی و زمان‌بندی برای موفقیت در امتحانات کلاسی، آزمون‌های آزمایشی و امتحانات نهایی مدارس.',
      content: `<h2>چگونه استرس شب امتحان را مهار کنیم؟</h2><p>برنامه‌ریزی منظم تنها راه نجات از انباشته شدن درس‌ها در شب امتحان است. در این مقاله می‌آموزید چگونه با مرورهای منظم، درک عمیق‌تری از مباحث داشته باشید.</p><h3>اصول خلاصه‌نویسی استاندارد</h3><p>برای مرور سریع، از نمودارهای درختی و کلمات کلیدی استفاده کنید تا مغز بتواند ساختار کلیدی درس را بازیابی کند.</p>`,
      coverImage: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&auto=format&fit=crop&q=80',
      coverImageAlt: 'برنامه‌ریزی امتحانات دانش‌آموزان',
      category: 'آمادگی امتحانات',
      tags: ['امتحانات', 'برنامه‌ریزی', 'مرور درس‌ها', 'خلاصه‌نویسی'],
      author: { name: 'تیم مشاوره نوکیتا', role: 'مشاور تحصیلی' },
      readingTime: 6,
      isFeatured: true,
      isPublished: true,
      publishedAt: new Date(),
      targetAudience: 'nokita',
      seo: {
        focusKeyword: 'آمادگی امتحانات',
        metaTitle: 'راهنمای برنامه‌ریزی امتحانات دانش‌آموزی | نوکیتا',
        metaDescription: 'راهکارهای علمی برنامه‌ریزی امتحانات مدارس برای دانش‌آموزان با نوکیتا.',
        canonicalUrl: 'https://nokita.kitayar.ir/blog/چگونه-برای-امتحانات-نهایی-و-کلاسی-برنامه-ریزی-کنیم',
        ogTitle: 'راهنمای برنامه‌ریزی امتحانات',
        ogDescription: 'برنامه‌ریزی امتحانات برای دانش‌آموزان',
        ogImage: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&auto=format&fit=crop&q=80',
        robotsNoIndex: false,
        robotsNoFollow: false,
        schemaType: 'Article',
        seoScore: 88,
      },
    },
    {
      title: '۵ راهکار علمی برای رفع حواس‌پرتی و افزایش تمرکز هنگام مطالعه',
      slug: 'تکنیک-های-افزایش-تمرکز-هنگام-مطالعه',
      excerpt:
        'چرا هنگام درس خواندن حواسمان پرت می‌شود؟ بررسی راهکارهای علمی برای پاکسازی محیط مطالعه و تمرکز ۱۰۰ درصدی.',
      content: `<h2>چرا تمرکز هنگام مطالعه از بین می‌رود؟</h2><p>نوتیفیکیشن‌های موبایل، بی‌خوابی و نامرتب بودن میز مطالعه از مهم‌ترین عوامل کاهش تمرکز هستند. با تکنیک‌های ارائه شده، ذهن خود را متمرکز نگه دارید.</p>`,
      coverImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80',
      coverImageAlt: 'تمرکز مطالعه دانش‌آموزان',
      category: 'انگیزشی و تمرکز',
      tags: ['تمرکز', 'حواس‌پرتی', 'محیط مطالعه', 'یادگیری'],
      author: { name: 'تیم مشاوره نوکیتا', role: 'مشاور تحصیلی' },
      readingTime: 5,
      isFeatured: false,
      isPublished: true,
      publishedAt: new Date(),
      targetAudience: 'nokita',
      seo: {
        focusKeyword: 'افزایش تمرکز هنگام مطالعه',
        metaTitle: 'افزایش تمرکز هنگام مطالعه دانش‌آموزان | نوکیتا',
        metaDescription: 'روش‌های علمی افزایش تمرکز هنگام درس خواندن برای دانش‌آموزان.',
        canonicalUrl: 'https://nokita.kitayar.ir/blog/تکنیک-های-افزایش-تمرکز-هنگام-مطالعه',
        ogTitle: 'تکنیک‌های افزایش تمرکز هنگام مطالعه',
        ogDescription: 'راهکارهای افزایش تمرکز برای دانش‌آموزان',
        ogImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80',
        robotsNoIndex: false,
        robotsNoFollow: false,
        schemaType: 'Article',
        seoScore: 90,
      },
    },
  ];

  await Post.insertMany(articles);
}

/**
 * دریافت کلیه تنظیمات عمومی سایت نوکیتا (صفحه اصلی، دانلود اپلیکیشن، تماس، درباره ما و سئو)
 */
export const getNokitaPublicSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await ensureNokitaSettings();
    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت تنظیمات سایت نوکیتا:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت تنظیمات' });
  }
};

/**
 * دریافت لیست مقالات وبلاگ اختصاصی نوکیتا (یا مشترک با کیتایار)
 */
export const getNokitaBlogPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureNokitaSeedArticles();
    const { category, search, page = '1', limit = '12' } = req.query as Record<string, string>;

    const filter: Record<string, any> = {
      isPublished: true,
      targetAudience: { $in: ['nokita', 'all'] },
    };

    if (category && category !== 'all' && category.trim()) {
      filter.category = category.trim();
    }

    if (search && search.trim()) {
      const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safe, 'i');
      filter.$or = [
        { title: regex },
        { excerpt: regex },
        { tags: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const [posts, total, categories] = await Promise.all([
      Post.find(filter)
        .select('title slug excerpt coverImage coverImageAlt category tags readingTime publishedAt isFeatured')
        .sort({ isFeatured: -1, publishedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Post.countDocuments(filter),
      Post.distinct('category', { isPublished: true, targetAudience: { $in: ['nokita', 'all'] } }),
    ]);

    res.status(200).json({
      success: true,
      data: posts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      categories,
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت مقالات نوکیتا:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت مقالات' });
  }
};

/**
 * دریافت اطلاعات یک مقاله وبلاگ نوکیتا همراه با مقالات مرتبط
 */
export const getNokitaPostBySlug = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawSlug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    if (!rawSlug) {
      res.status(400).json({ success: false, message: 'شناسه مقاله الزامی است' });
      return;
    }

    const post = await Post.findOne({
      slug: decodeURIComponent(rawSlug),
      isPublished: true,
      targetAudience: { $in: ['nokita', 'all'] },
    });

    if (!post) {
      res.status(404).json({ success: false, message: 'مقاله مورد نظر یافت نشد' });
      return;
    }

    // افزایش شمارشگر بازدید
    post.views = (post.views || 0) + 1;
    await post.save();

    // مقالات مرتبط
    const relatedPosts = await Post.find({
      _id: { $ne: post._id },
      isPublished: true,
      targetAudience: { $in: ['nokita', 'all'] },
      category: post.category,
    })
      .select('title slug excerpt coverImage readingTime publishedAt')
      .limit(3)
      .lean();

    res.status(200).json({
      success: true,
      data: post,
      relatedPosts,
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت مقاله نوکیتا:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت مقاله' });
  }
};

/**
 * دریافت لیست سؤالات متداول دانش‌آموزان
 */
export const getNokitaFaqs = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await ensureNokitaSettings();
    const faqs = ((settings.faqList || []) as any[])
      .filter((f: any) => f.isPublished !== false)
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

    res.status(200).json({
      success: true,
      data: faqs,
    });
  } catch (error: any) {
    logger.error('❌ خطا در دریافت سوالات متداول:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در دریافت سوالات' });
  }
};

/**
 * دریافت کلیه اسلاگ‌ها برای ساخت داینامیک نقشه سایت (Sitemap)
 */
export const getNokitaSitemapSlugs = async (req: Request, res: Response): Promise<void> => {
  try {
    const posts = await Post.find({
      isPublished: true,
      targetAudience: { $in: ['nokita', 'all'] },
      'seo.robotsNoIndex': { $ne: true },
    })
      .select('slug updatedAt publishedAt')
      .lean();

    const categories = await Post.distinct('category', {
      isPublished: true,
      targetAudience: { $in: ['nokita', 'all'] },
    });

    res.status(200).json({
      success: true,
      data: {
        posts: posts.map((p) => ({
          slug: p.slug,
          lastModified: p.updatedAt || p.publishedAt || new Date(),
        })),
        categories,
      },
    });
  } catch (error: any) {
    logger.error('❌ خطا در نقشه سایت نوکیتا:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};
