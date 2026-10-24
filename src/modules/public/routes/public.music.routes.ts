import { Router } from 'express';
import * as musicCtrl from '../controllers/public.music.controller.js';

const router = Router();

// لیست دسته‌بندی‌ها به همراه ۱۰ آهنگ اول
router.get('/categories', musicCtrl.getCategoriesWithTracks);

// تمام آهنگ‌های یک دسته‌بندی (مشاهده بیشتر)
router.get('/categories/:id/tracks', musicCtrl.getCategoryTracks);

// جستجوی سراسری
router.get('/search', musicCtrl.searchTracks);

// جزئیات یک آهنگ و ثبت پخش
router.get('/tracks/:id', musicCtrl.getTrackById);

export default router;
