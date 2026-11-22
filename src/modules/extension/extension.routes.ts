import { Router } from 'express';
import publicRoutes from './routes/extension.public.routes.js';
import adminRoutes from './routes/extension.admin.routes.js';

const router = Router();

// روت‌های عمومی و کاربردی افزونه
router.use('/', publicRoutes);

// روت‌های مدیریتی ادمین
router.use('/admin', adminRoutes);

export default router;
