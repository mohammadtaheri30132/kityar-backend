import { Request, Response } from 'express';
import { MusicCategory } from '../../../core/models/MusicCategory.js';
import { Music } from '../../../core/models/Music.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * دریافت لیست دسته‌بندی‌های فعال به همراه ۱۰ موزیک برتر هر دسته‌بندی
 * ویژه صفحه اصلی بخش موزیک ابزارها
 */
export const getCategoriesWithTracks = async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await MusicCategory.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .lean();

    const result = await Promise.all(
      categories.map(async (cat) => {
        const totalTracks = await Music.countDocuments({ categoryId: cat._id, isActive: true });
        const tracks = await Music.find({ categoryId: cat._id, isActive: true })
          .sort({ order: 1, createdAt: -1 })
          .limit(10)
          .lean();

        return {
          ...cat,
          totalTracks,
          hasMore: totalTracks > 10,
          tracks,
        };
      })
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('Error fetching public categories with tracks:', error);
    res.status(500).json({ success: false, message: 'خطا در بارگذاری موزیک‌ها', error: error.message });
  }
};

/**
 * دریافت کامل موزیک‌های یک دسته‌بندی به همراه صفحه‌بندی و قابلیت جستجو
 * ویژه دکمه «مشاهده بیشتر» دسته‌بندی
 */
export const getCategoryTracks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, q } = req.query;

    const category = await MusicCategory.findById(id).lean();
    if (!category) {
      res.status(404).json({ success: false, message: 'دسته‌بندی مورد نظر یافت نشد' });
      return;
    }

    const filter: any = { categoryId: id, isActive: true };
    if (q && typeof q === 'string' && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [{ title: regex }, { artist: regex }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Music.countDocuments(filter);
    const tracks = await Music.find(filter)
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    res.json({
      success: true,
      data: {
        category,
        tracks,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    logger.error('Error fetching category tracks:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت لیست آهنگ‌ها', error: error.message });
  }
};

/**
 * دریافت جزئیات یک آهنگ به همراه لیریکس و افزایش شمارنده پخش
 */
export const getTrackById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const track = await Music.findByIdAndUpdate(
      id,
      { $inc: { playsCount: 1 } },
      { new: true }
    )
      .populate('categoryId', 'title')
      .lean();

    if (!track) {
      res.status(404).json({ success: false, message: 'آهنگ یافت نشد' });
      return;
    }

    res.json({
      success: true,
      data: track,
    });
  } catch (error: any) {
    logger.error('Error fetching track by id:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات آهنگ', error: error.message });
  }
};

/**
 * جستجوی سراسری آهنگ‌ها بر اساس نام آهنگ یا نام خواننده
 */
export const searchTracks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, limit = 30 } = req.query;

    if (!q || typeof q !== 'string' || !q.trim()) {
      res.json({ success: true, data: [] });
      return;
    }

    const regex = new RegExp(q.trim(), 'i');
    const tracks = await Music.find({
      isActive: true,
      $or: [{ title: regex }, { artist: regex }],
    })
      .populate('categoryId', 'title')
      .sort({ playsCount: -1, order: 1 })
      .limit(Number(limit))
      .lean();

    res.json({
      success: true,
      data: tracks,
    });
  } catch (error: any) {
    logger.error('Error searching tracks:', error);
    res.status(500).json({ success: false, message: 'خطا در جستجوی موزیک', error: error.message });
  }
};
