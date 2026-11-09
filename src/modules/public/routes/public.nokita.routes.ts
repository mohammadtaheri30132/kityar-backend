import { Router } from 'express';
import {
  getNokitaPublicSettings,
  getNokitaBlogPosts,
  getNokitaPostBySlug,
  getNokitaFaqs,
  getNokitaSitemapSlugs,
} from '../controllers/public.nokita.controller.js';

const router = Router();

router.get('/settings', getNokitaPublicSettings);
router.get('/blog', getNokitaBlogPosts);
router.get('/blog/:slug', getNokitaPostBySlug);
router.get('/faq', getNokitaFaqs);
router.get('/sitemap', getNokitaSitemapSlugs);

export default router;

