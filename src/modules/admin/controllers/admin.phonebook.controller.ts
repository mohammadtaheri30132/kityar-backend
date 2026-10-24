import { Request, Response } from 'express';
import { PhonebookCategory, IPhonebookCategory } from '../../../core/models/PhonebookCategory.js';
import { PhonebookContact, IPhonebookContact } from '../../../core/models/PhonebookContact.js';
import * as XLSX from 'xlsx';
import mongoose from 'mongoose';

// =================== Categories ===================

export const getCategories = async (req: Request, res: Response) => {
  try {
    const { parentId, flat } = req.query;

    const query: any = {};
    if (parentId === 'root' || parentId === 'null') {
      query.parentId = null;
    } else if (parentId) {
      query.parentId = parentId;
    }

    const categories = await PhonebookCategory.find(query).sort({ order: 1, createdAt: 1 }).lean();

    // Attach subcategory count & contact count for each category
    const enriched = await Promise.all(
      categories.map(async (cat) => {
        const [subCount, contactCount] = await Promise.all([
          PhonebookCategory.countDocuments({ parentId: cat._id }),
          PhonebookContact.countDocuments({ categoryId: cat._id }),
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

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { title, description, icon, color, parentId, order, isEmergency } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'عنوان دسته‌بندی الزامی است' });
    }

    let validParentId: mongoose.Types.ObjectId | null = null;
    if (parentId && parentId !== 'null' && parentId !== 'root') {
      validParentId = new mongoose.Types.ObjectId(parentId);
      const parentExists = await PhonebookCategory.findById(validParentId);
      if (!parentExists) {
        return res.status(400).json({ success: false, message: 'دسته‌بندی والد یافت نشد' });
      }
    }

    const category = await PhonebookCategory.create({
      title: title.trim(),
      description: description?.trim() || '',
      icon: icon?.trim() || 'phone',
      color: color?.trim() || '#3b82f6',
      parentId: validParentId,
      order: order !== undefined ? Number(order) : 0,
      isEmergency: Boolean(isEmergency),
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: 'دسته‌بندی با موفقیت ایجاد شد',
      category,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در ایجاد دسته‌بندی' });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, icon, color, parentId, order, isEmergency, isActive } = req.body;

    const category = await PhonebookCategory.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'دسته‌بندی یافت نشد' });
    }

    if (title !== undefined) category.title = title.trim();
    if (description !== undefined) category.description = description.trim();
    if (icon !== undefined) category.icon = icon.trim();
    if (color !== undefined) category.color = color.trim();
    if (order !== undefined) category.order = Number(order);
    if (isEmergency !== undefined) category.isEmergency = Boolean(isEmergency);
    if (isActive !== undefined) category.isActive = Boolean(isActive);

    if (parentId !== undefined) {
      if (parentId && parentId !== 'null' && parentId !== 'root') {
        if (parentId === id) {
          return res.status(400).json({ success: false, message: 'یک دسته‌بندی نمی‌تواند والد خودش باشد' });
        }
        category.parentId = new mongoose.Types.ObjectId(parentId);
      } else {
        category.parentId = null;
      }
    }

    await category.save();

    res.json({
      success: true,
      message: 'دسته‌بندی با موفقیت ویرایش شد',
      category,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در ویرایش دسته‌بندی' });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const category = await PhonebookCategory.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'دسته‌بندی یافت نشد' });
    }

    // Recursively collect all descendant category IDs
    const getAllDescendantIds = async (parentId: any): Promise<any[]> => {
      const children = await PhonebookCategory.find({ parentId }).select('_id');
      let ids: any[] = [];
      for (const child of children) {
        ids.push(child._id);
        const subIds = await getAllDescendantIds(child._id);
        ids = ids.concat(subIds);
      }
      return ids;
    };

    const descendantIds = await getAllDescendantIds(category._id);
    const allCategoryIdsToDelete = [category._id, ...descendantIds];

    // Delete contacts in these categories
    await PhonebookContact.deleteMany({ categoryId: { $in: allCategoryIdsToDelete } });

    // Delete categories
    await PhonebookCategory.deleteMany({ _id: { $in: allCategoryIdsToDelete } });

    res.json({
      success: true,
      message: `دسته‌بندی و ${descendantIds.length} زیردسته و تمام شماره‌های آن‌ها حذف شدند`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در حذف دسته‌بندی' });
  }
};

// =================== Contacts ===================

export const getContacts = async (req: Request, res: Response) => {
  try {
    const { categoryId, search, isEmergency, page = 1, limit = 50 } = req.query;

    const query: any = {};
    if (categoryId) {
      query.categoryId = categoryId;
    }
    if (isEmergency !== undefined) {
      query.isEmergency = isEmergency === 'true' || (isEmergency as any) === true;
    }
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { phoneNumber: { $regex: q, $options: 'i' } },
        { phoneSecondary: { $regex: q, $options: 'i' } },
        { department: { $regex: q, $options: 'i' } },
        { responsiblePerson: { $regex: q, $options: 'i' } },
        { city: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [contacts, total] = await Promise.all([
      PhonebookContact.find(query)
        .populate('categoryId', 'title color icon parentId')
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      PhonebookContact.countDocuments(query),
    ]);

    res.json({
      success: true,
      contacts,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در دریافت مخاطبین' });
  }
};

export const createContact = async (req: Request, res: Response) => {
  try {
    const {
      title,
      phoneNumber,
      phoneSecondary,
      internalNumber,
      categoryId,
      department,
      responsiblePerson,
      city,
      address,
      description,
      order,
      isEmergency,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'عنوان یا نام مخاطب الزامی است' });
    }
    if (!phoneNumber || !phoneNumber.trim()) {
      return res.status(400).json({ success: false, message: 'شماره تلفن الزامی است' });
    }
    if (!categoryId) {
      return res.status(400).json({ success: false, message: 'انتخاب دسته‌بندی الزامی است' });
    }

    const catExists = await PhonebookCategory.findById(categoryId);
    if (!catExists) {
      return res.status(400).json({ success: false, message: 'دسته‌بندی مشخص‌شده وجود ندارد' });
    }

    const contact = await PhonebookContact.create({
      title: title.trim(),
      phoneNumber: phoneNumber.trim(),
      phoneSecondary: phoneSecondary?.trim() || '',
      internalNumber: internalNumber?.trim() || '',
      categoryId: new mongoose.Types.ObjectId(categoryId),
      department: department?.trim() || '',
      responsiblePerson: responsiblePerson?.trim() || '',
      city: city?.trim() || '',
      address: address?.trim() || '',
      description: description?.trim() || '',
      order: order !== undefined ? Number(order) : 0,
      isEmergency: Boolean(isEmergency),
      isActive: true,
    });

    const populated = await PhonebookContact.findById(contact._id).populate('categoryId', 'title color icon');

    res.status(201).json({
      success: true,
      message: 'مخاطب با موفقیت ثبت شد',
      contact: populated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در ثبت مخاطب' });
  }
};

export const updateContact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      phoneNumber,
      phoneSecondary,
      internalNumber,
      categoryId,
      department,
      responsiblePerson,
      city,
      address,
      description,
      order,
      isEmergency,
      isActive,
    } = req.body;

    const contact = await PhonebookContact.findById(id);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'مخاطب یافت نشد' });
    }

    if (title !== undefined) contact.title = title.trim();
    if (phoneNumber !== undefined) contact.phoneNumber = phoneNumber.trim();
    if (phoneSecondary !== undefined) contact.phoneSecondary = phoneSecondary.trim();
    if (internalNumber !== undefined) contact.internalNumber = internalNumber.trim();
    if (department !== undefined) contact.department = department.trim();
    if (responsiblePerson !== undefined) contact.responsiblePerson = responsiblePerson.trim();
    if (city !== undefined) contact.city = city.trim();
    if (address !== undefined) contact.address = address.trim();
    if (description !== undefined) contact.description = description.trim();
    if (order !== undefined) contact.order = Number(order);
    if (isEmergency !== undefined) contact.isEmergency = Boolean(isEmergency);
    if (isActive !== undefined) contact.isActive = Boolean(isActive);

    if (categoryId) {
      const catExists = await PhonebookCategory.findById(categoryId);
      if (!catExists) {
        return res.status(400).json({ success: false, message: 'دسته‌بندی مشخص‌شده وجود ندارد' });
      }
      contact.categoryId = new mongoose.Types.ObjectId(categoryId);
    }

    await contact.save();
    const populated = await PhonebookContact.findById(contact._id).populate('categoryId', 'title color icon');

    res.json({
      success: true,
      message: 'مخاطب با موفقیت ویرایش شد',
      contact: populated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در ویرایش مخاطب' });
  }
};

export const deleteContact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contact = await PhonebookContact.findByIdAndDelete(id);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'مخاطب یافت نشد' });
    }
    res.json({ success: true, message: 'مخاطب با موفقیت حذف شد' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در حذف مخاطب' });
  }
};

// =================== Excel Import & Batch ===================

export const importExcel = async (req: Request, res: Response) => {
  try {
    let rows: any[] = [];
    const targetCategoryId = req.body.targetCategoryId;

    // 1. If JSON array passed directly from frontend client-side parsed Excel
    if (Array.isArray(req.body.items) && req.body.items.length > 0) {
      rows = req.body.items;
    } else if (req.file) {
      // 2. If uploaded as multipart file
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const firstSheet = workbook.SheetNames[0];
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);
    } else {
      return res.status(400).json({ success: false, message: 'هیچ داده یا فایلی برای وارد کردن ارسال نشده است' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'فایل یا داده ارسالی خالی است' });
    }

    let defaultCategory: any = null;
    if (targetCategoryId) {
      defaultCategory = await PhonebookCategory.findById(targetCategoryId);
    }
    if (!defaultCategory) {
      defaultCategory = await PhonebookCategory.findOne({ parentId: null }).sort({ order: 1 });
      if (!defaultCategory) {
        defaultCategory = await PhonebookCategory.create({
          title: 'عمومی',
          icon: 'phone',
          color: '#3b82f6',
        });
      }
    }

    // Category cache map by name to avoid redundant DB queries
    const categoryCache = new Map<string, mongoose.Types.ObjectId>();

    let importedCount = 0;
    let createdCategoryCount = 0;

    for (const row of rows) {
      // Support Persian, English, and common column variants
      const title = row['عنوان'] || row['نام'] || row['نام و نام خانوادگی'] || row['Title'] || row['Name'] || row['title'] || row['name'];
      const phone = row['شماره'] || row['تلفن'] || row['شماره تماس'] || row['Phone'] || row['phone'] || row['phoneNumber'];
      const phoneSecondary = row['شماره دوم'] || row['تلفن همراه'] || row['موبایل'] || row['Mobile'] || row['phoneSecondary'] || '';
      const internalNumber = row['داخلی'] || row['Internal'] || row['internal'] || '';
      const categoryName = row['دسته‌بندی'] || row['دسته'] || row['گروه'] || row['Category'] || row['category'];
      const subcategoryName = row['زیردسته'] || row['Subcategory'] || row['subcategory'];
      const department = row['بخش'] || row['واحد'] || row['اداره'] || row['Department'] || row['department'] || '';
      const responsiblePerson = row['مسئول'] || row['پاسخگو'] || row['Responsible'] || row['responsible'] || '';
      const city = row['شهر'] || row['استان'] || row['منطقه'] || row['City'] || row['city'] || '';
      const description = row['توضیحات'] || row['یادداشت'] || row['Description'] || row['description'] || '';
      const isEmergency = row['اضطراری'] === 'بله' || row['اضطراری'] === true || row['Emergency'] === true || row['emergency'] === true;

      if (!title || !phone) continue;

      let contactCatId = defaultCategory._id;

      // Handle category & subcategory from row if provided
      if (categoryName && typeof categoryName === 'string' && categoryName.trim()) {
        const catTrimmed = categoryName.trim();
        let parentCatId = categoryCache.get(catTrimmed);

        if (!parentCatId) {
          let foundParent = await PhonebookCategory.findOne({ title: catTrimmed, parentId: null });
          if (!foundParent) {
            foundParent = await PhonebookCategory.create({
              title: catTrimmed,
              icon: 'folder',
              color: '#0284c7',
            });
            createdCategoryCount++;
          }
          parentCatId = foundParent._id as mongoose.Types.ObjectId;
          categoryCache.set(catTrimmed, parentCatId);
        }

        contactCatId = parentCatId;

        // If subcategory is also specified
        if (subcategoryName && typeof subcategoryName === 'string' && subcategoryName.trim()) {
          const subTrimmed = subcategoryName.trim();
          const subCacheKey = `${catTrimmed}__${subTrimmed}`;
          let subCatId = categoryCache.get(subCacheKey);

          if (!subCatId) {
            let foundSub = await PhonebookCategory.findOne({ title: subTrimmed, parentId: parentCatId });
            if (!foundSub) {
              foundSub = await PhonebookCategory.create({
                title: subTrimmed,
                parentId: parentCatId,
                icon: 'phone',
                color: '#6366f1',
              });
              createdCategoryCount++;
            }
            subCatId = foundSub._id as mongoose.Types.ObjectId;
            categoryCache.set(subCacheKey, subCatId);
          }
          contactCatId = subCatId;
        }
      }

      await PhonebookContact.create({
        title: String(title).trim(),
        phoneNumber: String(phone).trim(),
        phoneSecondary: phoneSecondary ? String(phoneSecondary).trim() : '',
        internalNumber: internalNumber ? String(internalNumber).trim() : '',
        categoryId: contactCatId,
        department: department ? String(department).trim() : '',
        responsiblePerson: responsiblePerson ? String(responsiblePerson).trim() : '',
        city: city ? String(city).trim() : '',
        description: description ? String(description).trim() : '',
        isEmergency: Boolean(isEmergency),
        isActive: true,
      });

      importedCount++;
    }

    res.json({
      success: true,
      message: `${importedCount} شماره تلفن با موفقیت ذخیره شد (${createdCategoryCount} دسته‌بندی جدید ایجاد شد)`,
      importedCount,
      createdCategoryCount,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در بارگذاری اطلاعات اکسل' });
  }
};

// =================== Seeding Defaults ===================

export const seedDefaults = async (req: Request, res: Response) => {
  try {
    const existing = await PhonebookCategory.countDocuments();
    if (existing > 0) {
      return res.json({ success: true, message: 'اطلاعات از قبل در پایگاه داده وجود دارد' });
    }

    // 1. Emergency Category
    const emergencyCat = await PhonebookCategory.create({
      title: 'تماس‌های اضطراری کشور',
      description: 'شماره‌های فوریتی و امدادی سراسری ۲۴ ساعته',
      icon: 'alert-triangle',
      color: '#ef4444',
      isEmergency: true,
      order: 1,
    });

    const emergencies = [
      { title: 'اورژانس کشور', phone: '115', isEmergency: true, department: 'فوریت‌های پزشکی' },
      { title: 'آتش‌نشانی و خدمات ایمنی', phone: '125', isEmergency: true, department: 'ایمنی و نجات' },
      { title: 'پلیس ۱۱۰ (فوریت‌های پلیسی)', phone: '110', isEmergency: true, department: 'انتظامی' },
      { title: 'هلال احمر (امداد و نجات)', phone: '112', isEmergency: true, department: 'امداد کوهستان و جاده' },
      { title: 'اورژانس اجتماعی (بهزیستی)', phone: '123', isEmergency: true, department: 'مشاوره و آسیب‌های اجتماعی' },
      { title: 'پلیس فتا (جرایم سایبری)', phone: '096380', isEmergency: true, department: 'امنیت سایبری' },
      { title: 'اطلاعات دارویی و سموم', phone: '190', isEmergency: true, department: 'دارو و درمان' },
    ];

    for (const em of emergencies) {
      await PhonebookContact.create({
        title: em.title,
        phoneNumber: em.phone,
        categoryId: emergencyCat._id,
        department: em.department,
        isEmergency: true,
      });
    }

    // 2. Ministry of Education
    const ministryCat = await PhonebookCategory.create({
      title: 'وزارت آموزش و پرورش',
      description: 'ستاد مرکزی و سازمان‌های تابعه',
      icon: 'building',
      color: '#3b82f6',
      order: 2,
    });

    const ministryContacts = [
      { title: 'تلفنخانه مرکزی وزارت آموزش و پرورش', phone: '021-82281111', department: 'روابط عمومی و امور بین‌الملل' },
      { title: 'ستاد پاسخگویی و بازرسی شکایات', phone: '021-82282222', department: 'ارزیابی عملکرد و پاسخگویی به شکایات' },
      { title: 'مرکز برنامه‌ریزی منابع انسانی و فناوری', phone: '021-88899991', department: 'فناوری اطلاعات' },
      { title: 'سازمان پژوهش و برنامه‌ریزی آموزشی (کتاب‌های درسی)', phone: '021-88831140', department: 'تألیف کتب درسی' },
      { title: 'سازمان سنجش و پایش کیفیت آموزشی', phone: '021-88820000', department: 'امتحانات و ارزشیابی' },
    ];

    for (const mc of ministryContacts) {
      await PhonebookContact.create({
        title: mc.title,
        phoneNumber: mc.phone,
        categoryId: ministryCat._id,
        department: mc.department,
      });
    }

    // 3. Tehran Province (with subcategories)
    const tehranProvince = await PhonebookCategory.create({
      title: 'استان تهران',
      description: 'ادارات کل و مناطق ۱۹ گانه شهر تهران',
      icon: 'map-pin',
      color: '#10b981',
      order: 3,
    });

    // Subcategory: General Directorate
    const tehranGeneral = await PhonebookCategory.create({
      title: 'اداره کل آموزش و پرورش شهر تهران',
      parentId: tehranProvince._id,
      icon: 'landmark',
      color: '#059669',
      order: 1,
    });

    await PhonebookContact.create({
      title: 'دفتر مدیر کل آموزش و پرورش شهر تهران',
      phoneNumber: '021-88960001',
      categoryId: tehranGeneral._id,
      department: 'دفتر ریاست',
    });
    await PhonebookContact.create({
      title: 'معاونت آموزش متوسطه',
      phoneNumber: '021-88960002',
      categoryId: tehranGeneral._id,
      department: 'معاونت متوسطه',
    });
    await PhonebookContact.create({
      title: 'معاونت آموزش ابتدایی',
      phoneNumber: '021-88960003',
      categoryId: tehranGeneral._id,
      department: 'معاونت ابتدایی',
    });

    // Subcategory: Region 5
    const region5 = await PhonebookCategory.create({
      title: 'آموزش و پرورش منطقه ۵ تهران',
      parentId: tehranProvince._id,
      icon: 'school',
      color: '#8b5cf6',
      order: 2,
    });

    await PhonebookContact.create({
      title: 'دبیرخانه و روابط عمومی منطقه ۵',
      phoneNumber: '021-44005511',
      categoryId: region5._id,
      department: 'دبیرخانه',
      city: 'تهران',
    });
    await PhonebookContact.create({
      title: 'کارشناسی مدارس غیردولتی و شاهد',
      phoneNumber: '021-44005512',
      categoryId: region5._id,
      department: 'مشارکت‌های مردمی',
      city: 'تهران',
    });

    res.json({
      success: true,
      message: 'اطلاعات پایه و پیش‌فرض با موفقیت ثبت شد',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'خطا در ثبت اطلاعات پیش‌فرض' });
  }
};
