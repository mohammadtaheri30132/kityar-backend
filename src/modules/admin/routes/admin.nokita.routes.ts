import { Router } from 'express';
import {
  getAdminNokitaSettings,
  updateAdminNokitaSettings,
} from '../controllers/admin.nokita.controller.js';
import { protect, adminOnly } from '../../../core/middleware/auth.js';

const router = Router();

router.use(protect, adminOnly);

router.get('/settings', getAdminNokitaSettings);
router.put('/settings', updateAdminNokitaSettings);

export default router;

