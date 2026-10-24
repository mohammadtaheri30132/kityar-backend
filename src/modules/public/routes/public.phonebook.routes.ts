import { Router } from 'express';
import * as phonebookCtrl from '../controllers/public.phonebook.controller.js';

const router = Router();

// Top-level categories
router.get('/categories', phonebookCtrl.getRootCategories);

// Category details, breadcrumbs, subcategories and direct contacts
router.get('/categories/:id', phonebookCtrl.getCategoryChildren);

// Emergency contacts
router.get('/emergency', phonebookCtrl.getEmergencyContacts);

// Global search
router.get('/search', phonebookCtrl.searchContacts);

// Full tree for offline caching
router.get('/tree', phonebookCtrl.getFullTree);

export default router;
