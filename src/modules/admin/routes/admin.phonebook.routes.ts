import { Router } from 'express';
import multer from 'multer';
import * as phonebookCtrl from '../controllers/admin.phonebook.controller.js';
import { protect, adminOnly } from '../../../core/middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Category CRUD
router.get('/categories', protect, adminOnly, phonebookCtrl.getCategories);
router.post('/categories', protect, adminOnly, phonebookCtrl.createCategory);
router.put('/categories/:id', protect, adminOnly, phonebookCtrl.updateCategory);
router.delete('/categories/:id', protect, adminOnly, phonebookCtrl.deleteCategory);

// Contact CRUD
router.get('/contacts', protect, adminOnly, phonebookCtrl.getContacts);
router.post('/contacts', protect, adminOnly, phonebookCtrl.createContact);
router.put('/contacts/:id', protect, adminOnly, phonebookCtrl.updateContact);
router.delete('/contacts/:id', protect, adminOnly, phonebookCtrl.deleteContact);

// Batch & Excel Import (handles both file upload and parsed JSON)
router.post('/import-excel', protect, adminOnly, upload.single('file'), phonebookCtrl.importExcel);

// Seeding
router.post('/seed-defaults', protect, adminOnly, phonebookCtrl.seedDefaults);

export default router;
