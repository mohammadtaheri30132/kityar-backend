import { Request, Response } from 'express';
import { MusicCategory } from '../../../core/models/MusicCategory.js';
import { Music } from '../../../core/models/Music.js';
import { logger } from '../../../core/utils/logger.js';
import fs from 'fs';
import path from 'path';

// ==================== Category Controllers ====================

export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await MusicCategory.find().sort({ order: 1, createdAt: -1 });

    // Count tracks in each category
    const categoriesWithCount = await Promise.all(
      categories.map(async (cat) => {
        const trackCount = await Music.countDocuments({ categoryId: cat._id });
        return {
          ...cat.toObject(),
          trackCount,
        };
      })
    );

    res.json({
      success: true,
      data: categoriesWithCount,
    });
  } catch (error: any) {
    logger.error('Error fetching music categories:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت دسته‌بندی‌ها', error: error.message });
  }
};

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, icon, coverUrl, order, isActive } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({ success: false, message: 'عنوان دسته‌بندی الزامی است' });
      return;
    }

    const category = new MusicCategory({
      title: title.trim(),
      description: description?.trim() || '',
      icon: icon?.trim() || 'music',
      coverUrl: coverUrl?.trim() || '',
      order: typeof order === 'number' ? order : 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    await category.save();

    res.status(201).json({
      success: true,
      message: 'دسته‌بندی با موفقیت ایجاد شد',
      data: category,
    });
  } catch (error: any) {
    logger.error('Error creating music category:', error);
    res.status(500).json({ success: false, message: 'خطا در ایجاد دسته‌بندی', error: error.message });
  }
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, icon, coverUrl, order, isActive } = req.body;

    const category = await MusicCategory.findById(id);
    if (!category) {
      res.status(404).json({ success: false, message: 'دسته‌بندی یافت نشد' });
      return;
    }

    if (title !== undefined) category.title = title.trim();
    if (description !== undefined) category.description = description.trim();
    if (icon !== undefined) category.icon = icon.trim();
    if (coverUrl !== undefined) category.coverUrl = coverUrl.trim();
    if (order !== undefined) category.order = order;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();

    res.json({
      success: true,
      message: 'دسته‌بندی با موفقیت به‌روزرسانی شد',
      data: category,
    });
  } catch (error: any) {
    logger.error('Error updating music category:', error);
    res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی دسته‌بندی', error: error.message });
  }
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const category = await MusicCategory.findById(id);
    if (!category) {
      res.status(404).json({ success: false, message: 'دسته‌بندی یافت نشد' });
      return;
    }

    // Delete associated music tracks or keep them
    await Music.deleteMany({ categoryId: id });
    await category.deleteOne();

    res.json({
      success: true,
      message: 'دسته‌بندی و موزیک‌های مربوطه حذف شدند',
    });
  } catch (error: any) {
    logger.error('Error deleting music category:', error);
    res.status(500).json({ success: false, message: 'خطا در حذف دسته‌بندی', error: error.message });
  }
};

// ==================== Track Controllers ====================

export const getTracks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId, q, page = 1, limit = 50 } = req.query;

    const filter: any = {};
    if (categoryId) {
      filter.categoryId = categoryId;
    }
    if (q && typeof q === 'string' && q.trim()) {
      const searchRegex = new RegExp(q.trim(), 'i');
      filter.$or = [{ title: searchRegex }, { artist: searchRegex }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Music.countDocuments(filter);
    const tracks = await Music.find(filter)
      .populate('categoryId', 'title')
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      data: tracks,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching tracks:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت لیست موزیک‌ها', error: error.message });
  }
};

export const createTrack = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, artist, audioUrl, coverUrl, lyrics, categoryId, duration, order, isActive } = req.body;

    if (!title || !artist || !audioUrl || !categoryId) {
      res.status(400).json({
        success: false,
        message: 'عنوان، نام خواننده، فایل صوتی و دسته‌بندی الزامی هستند',
      });
      return;
    }

    const track = new Music({
      title: title.trim(),
      artist: artist.trim(),
      audioUrl: audioUrl.trim(),
      coverUrl: coverUrl?.trim() || '',
      lyrics: lyrics?.trim() || '',
      categoryId,
      duration: Number(duration) || 0,
      order: Number(order) || 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    await track.save();
    await track.populate('categoryId', 'title');

    res.status(201).json({
      success: true,
      message: 'موزیک با موفقیت ثبت شد',
      data: track,
    });
  } catch (error: any) {
    logger.error('Error creating track:', error);
    res.status(500).json({ success: false, message: 'خطا در ایجاد موزیک', error: error.message });
  }
};

export const updateTrack = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, artist, audioUrl, coverUrl, lyrics, categoryId, duration, order, isActive } = req.body;

    const track = await Music.findById(id);
    if (!track) {
      res.status(404).json({ success: false, message: 'موزیک یافت نشد' });
      return;
    }

    if (title !== undefined) track.title = title.trim();
    if (artist !== undefined) track.artist = artist.trim();
    if (audioUrl !== undefined) track.audioUrl = audioUrl.trim();
    if (coverUrl !== undefined) track.coverUrl = coverUrl.trim();
    if (lyrics !== undefined) track.lyrics = lyrics.trim();
    if (categoryId !== undefined) track.categoryId = categoryId;
    if (duration !== undefined) track.duration = Number(duration);
    if (order !== undefined) track.order = Number(order);
    if (isActive !== undefined) track.isActive = isActive;

    await track.save();
    await track.populate('categoryId', 'title');

    res.json({
      success: true,
      message: 'موزیک با موفقیت به‌روزرسانی شد',
      data: track,
    });
  } catch (error: any) {
    logger.error('Error updating track:', error);
    res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی موزیک', error: error.message });
  }
};

export const deleteTrack = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const track = await Music.findById(id);
    if (!track) {
      res.status(404).json({ success: false, message: 'موزیک یافت نشد' });
      return;
    }

    // Try deleting uploaded files if local
    try {
      if (track.audioUrl && track.audioUrl.startsWith('/uploads/')) {
        const fullAudioPath = path.join(process.cwd(), 'public', track.audioUrl);
        if (fs.existsSync(fullAudioPath)) fs.unlinkSync(fullAudioPath);
      }
      if (track.coverUrl && track.coverUrl.startsWith('/uploads/')) {
        const fullCoverPath = path.join(process.cwd(), 'public', track.coverUrl);
        if (fs.existsSync(fullCoverPath)) fs.unlinkSync(fullCoverPath);
      }
    } catch (e) {
      // Ignore file deletion errors
    }

    await track.deleteOne();

    res.json({
      success: true,
      message: 'موزیک با موفقیت حذف شد',
    });
  } catch (error: any) {
    logger.error('Error deleting track:', error);
    res.status(500).json({ success: false, message: 'خطا در حذف موزیک', error: error.message });
  }
};

// ==================== Upload Handlers ====================

export const uploadAudioHandler = (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'فایل صوتی بارگذاری نشده است' });
    return;
  }

  const relativeUrl = `/uploads/music/audio/${req.file.filename}`;
  res.json({
    success: true,
    message: 'فایل صوتی با موفقیت بارگذاری شد',
    url: relativeUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
  });
};

export const uploadCoverHandler = (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'تصویر کاور بارگذاری نشده است' });
    return;
  }

  const relativeUrl = `/uploads/music/covers/${req.file.filename}`;
  res.json({
    success: true,
    message: 'تصویر کاور با موفقیت بارگذاری شد',
    url: relativeUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
  });
};
