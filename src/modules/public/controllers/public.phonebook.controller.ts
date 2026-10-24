import { Request, Response } from 'express';
import { PhonebookCategory } from '../../../core/models/PhonebookCategory.js';
import { PhonebookContact } from '../../../core/models/PhonebookContact.js';
import mongoose from 'mongoose';

/**
 * Get top-level root categories
 */
export const getRootCategories = async (req: Request, res: Response) => {
  try {
    const categories = await PhonebookCategory.find({ parentId: null, isActive: true })
      .sort({ isEmergency: -1, order: 1, createdAt: 1 })
      .lean();

    const enriched = await Promise.all(
      categories.map(async (cat) => {
        const [subCount, contactCount] = await Promise.all([
          PhonebookCategory.countDocuments({ parentId: cat._id, isActive: true }),
          PhonebookContact.countDocuments({ categoryId: cat._id, isActive: true }),
        ]);
        return {
          ...cat,
          subcategoriesCount: subCount,
          contactsCount: contactCount,
        };
      })
    );

    res.json({
      success: true,
      categories: enriched,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در دریافت دسته‌بندی‌ها' });
  }
};

/**
 * Get category details, breadcrumbs, child subcategories and direct contacts
 */
export const getCategoryChildren = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const currentCategory = await PhonebookCategory.findById(id).lean();
    if (!currentCategory) {
      return res.status(404).json({ success: false, message: 'دسته‌بندی یافت نشد' });
    }

    // Build breadcrumb trail up to root
    const breadcrumbs: any[] = [];
    let currParentId = currentCategory.parentId;
    while (currParentId) {
      const pCat = await PhonebookCategory.findById(currParentId).select('title _id parentId').lean();
      if (!pCat) break;
      breadcrumbs.unshift(pCat);
      currParentId = pCat.parentId;
    }
    breadcrumbs.push(currentCategory);

    // Get subcategories of this category
    const subcategories = await PhonebookCategory.find({ parentId: id, isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const enrichedSubcategories = await Promise.all(
      subcategories.map(async (sub) => {
        const [subCount, contactCount] = await Promise.all([
          PhonebookCategory.countDocuments({ parentId: sub._id, isActive: true }),
          PhonebookContact.countDocuments({ categoryId: sub._id, isActive: true }),
        ]);
        return {
          ...sub,
          subcategoriesCount: subCount,
          contactsCount: contactCount,
        };
      })
    );

    // Get contacts directly inside this category
    const contacts = await PhonebookContact.find({ categoryId: id, isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      category: currentCategory,
      breadcrumbs,
      subcategories: enrichedSubcategories,
      contacts,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در دریافت محتوای دسته‌بندی' });
  }
};

/**
 * Get emergency numbers
 */
export const getEmergencyContacts = async (req: Request, res: Response) => {
  try {
    const contacts = await PhonebookContact.find({ isEmergency: true, isActive: true })
      .populate('categoryId', 'title color icon')
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.json({
      success: true,
      contacts,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در دریافت شماره‌های اضطراری' });
  }
};

/**
 * Global search across contacts and categories
 */
export const searchContacts = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.json({ success: true, contacts: [], categories: [] });
    }

    const query = q.trim();
    const regex = new RegExp(query, 'i');

    const [contacts, categories] = await Promise.all([
      PhonebookContact.find({
        isActive: true,
        $or: [
          { title: regex },
          { phoneNumber: regex },
          { phoneSecondary: regex },
          { department: regex },
          { responsiblePerson: regex },
          { city: regex },
          { description: regex },
        ],
      })
        .populate('categoryId', 'title color icon parentId')
        .limit(50)
        .lean(),

      PhonebookCategory.find({
        isActive: true,
        $or: [{ title: regex }, { description: regex }],
      })
        .limit(20)
        .lean(),
    ]);

    res.json({
      success: true,
      contacts,
      categories,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در جستجوی دفترچه تلفن' });
  }
};

/**
 * Return full tree for complete offline caching in React Native app
 */
export const getFullTree = async (req: Request, res: Response) => {
  try {
    const [allCategories, allContacts] = await Promise.all([
      PhonebookCategory.find({ isActive: true }).sort({ order: 1 }).lean(),
      PhonebookContact.find({ isActive: true }).sort({ order: 1 }).lean(),
    ]);

    res.json({
      success: true,
      categories: allCategories,
      contacts: allContacts,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در بارگذاری اطلاعات کامل دفترچه تلفن' });
  }
};
