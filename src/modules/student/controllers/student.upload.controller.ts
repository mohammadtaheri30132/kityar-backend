import { Request, Response } from 'express';
import { logger } from '../../../core/utils/logger.js';
import path from 'path';
import fs from 'fs';

export const uploadStudentMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'هیچ فایلی ارسال نشده است' });
      return;
    }

    let finalFilename = req.file.filename;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(fileExt);

    // If it's an image and larger than 1MB, compress it to WebP
    // if (isImage && req.file.size > 1 * 1024 * 1024) {
    //   const webpFilename = `${req.file.filename.split('.')[0]}.webp`;
    //   const webpPath = path.join(req.file.destination, webpFilename);
      
    //   await sharp(req.file.path)
    //     .webp({ quality: 80 })
    //     .toFile(webpPath);
      
    //   // Delete original
    //   fs.unlinkSync(req.file.path);
    //   finalFilename = webpFilename;
    // }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileLink = `${baseUrl}/uploads/${finalFilename}`;
    res.status(200).json({ success: true, link: fileLink });
  } catch (error) {
    logger.error('❌ خطا در آپلود مدیای دانش‌آموز:', error);
    res.status(500).json({ success: false, message: 'خطای سرور' });
  }
};
