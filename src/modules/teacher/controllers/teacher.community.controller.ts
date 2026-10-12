import { Response } from 'express';
import { AuthRequest } from '../../../core/middleware/auth.js';
import { CommunityCategory } from '../../../core/models/CommunityCategory.js';
import { CommunityQuestion } from '../../../core/models/CommunityQuestion.js';
import { CommunityAnswer } from '../../../core/models/CommunityAnswer.js';
import { CommunityPost } from '../../../core/models/CommunityPost.js';
import { CommunityComment } from '../../../core/models/CommunityComment.js';
import { CommunityReport } from '../../../core/models/CommunityReport.js';
import { CommunityRestriction } from '../../../core/models/CommunityRestriction.js';
import { CommunitySettings } from '../../../core/models/CommunitySettings.js';
import { TeacherProfile } from '../../../core/models/TeacherProfile.js';
import { logger } from '../../../core/utils/logger.js';
import mongoose from 'mongoose';

const DEFAULT_CATEGORIES = [
  { name: 'اداری', slug: 'administrative', icon: 'Briefcase', color: '#2563EB', order: 1, description: 'امور اداری، بخشنامه‌ها و احکام معلمان' },
  { name: 'اخبار', slug: 'news', icon: 'Bell', color: '#059669', order: 2, description: 'تازه‌ترین اخبار آموزشی و اطلاعیه‌ها' },
  { name: 'ریاضی', slug: 'math', icon: 'Compass', color: '#7C3AED', order: 3, description: 'مباحث و تدریس درس ریاضی' },
  { name: 'علوم تجربی', slug: 'science', icon: 'FlaskConical', color: '#0891B2', order: 4, description: 'آموزش و آزمایش‌های علوم تجربی' },
  { name: 'فارسی و ادبیات', slug: 'persian', icon: 'BookOpen', color: '#DB2777', order: 5, description: 'زبان و ادبیات فارسی، املا و انشا' },
  { name: 'زبان انگلیسی', slug: 'english', icon: 'Globe', color: '#D97706', order: 6, description: 'مهارت‌ها و آزمون‌های زبان انگلیسی' },
  { name: 'مطالعات اجتماعی', slug: 'social-studies', icon: 'Users', color: '#4F46E5', order: 7, description: 'تاریخ، جغرافیا و مطالعات اجتماعی' },
  { name: 'دینی و قرآن', slug: 'quran', icon: 'Bookmark', color: '#0D9488', order: 8, description: 'آموزش قرآن و پیام‌های آسمان' },
  { name: 'عربی', slug: 'arabic', icon: 'Languages', color: '#E11D48', order: 9, description: 'قواعد و متون عربی' },
  { name: 'فیزیک و شیمی', slug: 'physics-chemistry', icon: 'Atom', color: '#65A30D', order: 10, description: 'علوم پایه دوره دوم' },
  { name: 'کلاس‌داری و مشاوره', slug: 'classroom-management', icon: 'Heart', color: '#EA580C', order: 11, description: 'مدیریت کلاس، انگیزش و مشاوره' },
];

// Helper to check if teacher is currently restricted
export const isUserRestricted = async (userId: string | mongoose.Types.ObjectId): Promise<boolean> => {
  const restriction = await CommunityRestriction.findOne({
    user: userId,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
  return Boolean(restriction);
};

// Helper for Auto Moderation Check
export const checkModeration = async (
  text: string,
  hasAttachments: boolean
): Promise<{
  isPending: boolean;
  reason?: 'contains_bad_words' | 'contains_image';
  matchedWords?: string[];
}> => {
  try {
    let settings = await CommunitySettings.findOne({ key: 'default' });
    if (!settings) {
      settings = await CommunitySettings.create({ key: 'default' });
    }

    // 1. Check attachments (images/files)
    if (hasAttachments && settings.requireApprovalForImages) {
      return { isPending: true, reason: 'contains_image' };
    }

    // 2. Check forbidden words
    if (settings.forbiddenWords && settings.forbiddenWords.length > 0) {
      const normalizedText = text
        .toLowerCase()
        .replace(/[ي]/g, 'ی')
        .replace(/[ك]/g, 'ک')
        .replace(/[\u200c\u200b]/g, ' ');

      const matched = settings.forbiddenWords.filter((w) => {
        const cleanWord = w.trim().toLowerCase().replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک');
        if (!cleanWord) return false;
        return normalizedText.includes(cleanWord);
      });

      if (matched.length > 0) {
        return { isPending: true, reason: 'contains_bad_words', matchedWords: matched };
      }
    }

    return { isPending: false };
  } catch (e) {
    logger.error('Error during community checkModeration:', e);
    return { isPending: false };
  }
};

// Helper to extract author details
const getAuthorDetails = async (req: AuthRequest) => {
  const user = req.user!;
  const teacherProf = await TeacherProfile.findOne({ user: user._id });
  const authorName = user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
  const authorRole = teacherProf ? `${teacherProf.position || 'معلم'} (${teacherProf.category || 'آموزگار'})` : 'دبیر';
  const authorAvatar = (user as any).avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=3B82F6&color=fff`;

  return {
    authorId: user._id,
    authorName,
    authorRole,
    authorAvatar,
  };
};

// ----------------------------------------------------------------------------
// CATEGORIES
// ----------------------------------------------------------------------------
export const getCategories = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let categories = await CommunityCategory.find({ isActive: true }).sort({ order: 1, createdAt: 1 });

    if (categories.length === 0) {
      await CommunityCategory.insertMany(DEFAULT_CATEGORIES);
      categories = await CommunityCategory.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    }

    res.json({
      success: true,
      data: categories,
    });
  } catch (err: any) {
    logger.error('Error in getCategories:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت دسته‌بندی‌ها' });
  }
};

// ----------------------------------------------------------------------------
// QUESTIONS
// ----------------------------------------------------------------------------
export const getQuestions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 15));
    const skip = (page - 1) * limit;

    const { category, search, sort, filter } = req.query;
    const query: any = { status: 'active' };

    if (category && category !== 'all' && category !== 'همه' && category !== 'همه دسته‌ها') {
      if (mongoose.Types.ObjectId.isValid(category as string)) {
        query.category = category;
      } else {
        const catDoc = await CommunityCategory.findOne({
          $or: [{ slug: category }, { name: category }],
        });
        if (catDoc) query.category = catDoc._id;
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: regex }, { body: regex }, { authorName: regex }, { tags: regex }];
    }

    const sortType = sort || filter;
    let sortOption: any = { isPinned: -1, createdAt: -1 };
    if (sortType === 'most_answered') {
      sortOption = { isPinned: -1, answerCount: -1, createdAt: -1 };
    }

    const [questions, total] = await Promise.all([
      CommunityQuestion.find(query)
        .populate('category', 'name slug color icon')
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      CommunityQuestion.countDocuments(query),
    ]);

    const userIdStr = req.user ? req.user._id.toString() : '';
    const formatted = questions.map((q) => ({
      ...q,
      isOwner: q.author.toString() === userIdStr,
      likedBy: undefined,
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    logger.error('Error in getQuestions:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت لیست سوالات' });
  }
};

// Get current user's questions
export const getMyQuestions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const query = {
      author: req.user!._id,
      status: { $ne: 'deleted' },
    };

    const [questions, total] = await Promise.all([
      CommunityQuestion.find(query)
        .populate('category', 'name slug color icon')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CommunityQuestion.countDocuments(query),
    ]);

    const formatted = questions.map((q) => ({
      ...q,
      isOwner: true,
      likedBy: undefined,
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    logger.error('Error in getMyQuestions:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت لیست پرسش‌های من' });
  }
};

export const getQuestionById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'شناسه سوال نامعتبر است' });
      return;
    }

    const userIdStr = req.user ? req.user._id.toString() : '';

    // Allow viewing if active, or if current user is the author (even pending_review)
    const question = await CommunityQuestion.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { status: 'active' },
          ...(req.user ? [{ author: req.user._id, status: { $ne: 'deleted' } }] : []),
        ],
      },
      { $inc: { viewCount: 1 } },
      { new: true }
    )
      .populate('category', 'name slug color icon')
      .lean();

    if (!question) {
      res.status(404).json({ success: false, message: 'سوال یافت نشد یا حذف شده است' });
      return;
    }

    // Fetch answers: active or authored by user
    const answers = await CommunityAnswer.find({
      question: id,
      $or: [
        { status: 'active' },
        ...(req.user ? [{ author: req.user._id, status: { $ne: 'deleted' } }] : []),
      ],
    })
      .sort({ isAccepted: -1, createdAt: 1 })
      .lean();

    const formattedAnswers = answers.map((a) => ({
      ...a,
      isOwner: a.author.toString() === userIdStr,
      likedBy: undefined,
    }));

    const formattedQuestion = {
      ...question,
      isOwner: question.author.toString() === userIdStr,
      answers: formattedAnswers,
      likedBy: undefined,
    };

    res.json({
      success: true,
      data: {
        ...formattedQuestion,
        question: formattedQuestion,
        answers: formattedAnswers,
      },
    });
  } catch (err: any) {
    logger.error('Error in getQuestionById:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت جزئیات سوال' });
  }
};

export const createQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (await isUserRestricted(req.user!._id)) {
      res.status(403).json({
        success: false,
        message: '⛔ دسترسی شما به فعالیت در جامعه معلمان به دلیل تخلف موقتاً مسدود شده است.',
      });
      return;
    }

    const { title, body, categoryId, category, tags, attachments } = req.body;
    const targetCategoryId = categoryId || category;

    if (!title || !title.trim()) {
      res.status(400).json({ success: false, message: 'عنوان سوال الزامی است' });
      return;
    }
    if (!body || !body.trim()) {
      res.status(400).json({ success: false, message: 'متن سوال الزامی است' });
      return;
    }
    if (!targetCategoryId || !mongoose.Types.ObjectId.isValid(targetCategoryId)) {
      res.status(400).json({ success: false, message: 'انتخاب یک دسته‌بندی معتبر الزامی است' });
      return;
    }

    const categoryDoc = await CommunityCategory.findOne({ _id: targetCategoryId, isActive: true });
    if (!categoryDoc) {
      res.status(400).json({ success: false, message: 'دسته‌بندی انتخابی یافت نشد یا غیرفعال است' });
      return;
    }

    const author = await getAuthorDetails(req);
    const attachmentsList = Array.isArray(attachments) ? attachments : [];

    // Moderation Check
    const moderation = await checkModeration(
      `${title.trim()} ${body.trim()}`,
      attachmentsList.length > 0
    );

    let status: 'active' | 'pending_review' = 'active';
    let moderationReason: string | undefined = undefined;
    let responseMessage = 'پرسش شما با موفقیت در تالار گفتگو منتشر شد';

    if (moderation.isPending) {
      status = 'pending_review';
      moderationReason = moderation.reason;
      if (moderation.reason === 'contains_bad_words') {
        responseMessage = 'پرسش شما ثبت شد اما به دلیل شناسایی واژگان حساس، پس از بررسی و تأیید ناظر نمایش داده خواهد شد.';
      } else if (moderation.reason === 'contains_image') {
        responseMessage = 'پرسش شما ثبت شد و به دلیل پیوست تصویر، پس از بررسی و تأیید ناظر در تالار گفتگو منتشر خواهد شد.';
      }
    }

    const newQuestion = await CommunityQuestion.create({
      title: title.trim(),
      body: body.trim(),
      author: author.authorId,
      authorName: author.authorName,
      authorRole: author.authorRole,
      authorAvatar: author.authorAvatar,
      category: categoryDoc._id,
      tags: Array.isArray(tags) ? tags.map((t: string) => String(t).trim()).filter(Boolean) : [],
      attachments: attachmentsList,
      status,
      moderationReason,
    });

    if (status === 'active') {
      await CommunityCategory.findByIdAndUpdate(categoryDoc._id, { $inc: { questionCount: 1 } });
    }

    const populated = await CommunityQuestion.findById(newQuestion._id).populate('category', 'name slug color icon');

    res.status(201).json({
      success: true,
      message: responseMessage,
      data: populated,
    });
  } catch (err: any) {
    logger.error('Error in createQuestion:', err);
    res.status(500).json({ success: false, message: 'خطا در ثبت سوال' });
  }
};

export const updateQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, body, tags } = req.body;

    const question = await CommunityQuestion.findById(id);
    if (!question || question.status === 'deleted') {
      res.status(404).json({ success: false, message: 'سوال یافت نشد' });
      return;
    }

    if (question.author.toString() !== req.user!._id.toString() && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, message: 'شما اجازه ویرایش این سوال را ندارید' });
      return;
    }

    if (title && title.trim()) question.title = title.trim();
    if (body && body.trim()) question.body = body.trim();
    if (Array.isArray(tags)) question.tags = tags;
    question.isEdited = true;

    await question.save();

    res.json({
      success: true,
      message: 'سوال با موفقیت ویرایش شد',
      data: question,
    });
  } catch (err: any) {
    logger.error('Error in updateQuestion:', err);
    res.status(500).json({ success: false, message: 'خطا در ویرایش سوال' });
  }
};

export const deleteQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const question = await CommunityQuestion.findById(id);
    if (!question || question.status === 'deleted') {
      res.status(404).json({ success: false, message: 'سوال یافت نشد' });
      return;
    }

    if (question.author.toString() !== req.user!._id.toString() && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, message: 'شما اجازه حذف این سوال را ندارید' });
      return;
    }

    question.status = 'deleted';
    await question.save();

    await CommunityCategory.findByIdAndUpdate(question.category, { $inc: { questionCount: -1 } });

    res.json({
      success: true,
      message: 'سوال با موفقیت حذف شد',
    });
  } catch (err: any) {
    logger.error('Error in deleteQuestion:', err);
    res.status(500).json({ success: false, message: 'خطا در حذف سوال' });
  }
};

export const toggleLikeQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!._id;

    const question = await CommunityQuestion.findById(id);
    if (!question || question.status !== 'active') {
      res.status(404).json({ success: false, message: 'سوال یافت نشد' });
      return;
    }

    const hasLiked = question.likedBy.some((uid) => uid.toString() === userId.toString());
    if (hasLiked) {
      question.likedBy = question.likedBy.filter((uid) => uid.toString() !== userId.toString());
      question.likeCount = Math.max(0, question.likeCount - 1);
    } else {
      question.likedBy.push(userId);
      question.likeCount += 1;
    }

    await question.save();

    res.json({
      success: true,
      liked: !hasLiked,
      likeCount: question.likeCount,
      data: {
        liked: !hasLiked,
        likeCount: question.likeCount,
      },
    });
  } catch (err: any) {
    logger.error('Error in toggleLikeQuestion:', err);
    res.status(500).json({ success: false, message: 'خطا در ثبت واکنش' });
  }
};

// ----------------------------------------------------------------------------
// ANSWERS
// ----------------------------------------------------------------------------
export const createAnswer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (await isUserRestricted(req.user!._id)) {
      res.status(403).json({
        success: false,
        message: '⛔ دسترسی شما به ارسال پاسخ در تالار گفتگو به دلیل تخلف مسدود است.',
      });
      return;
    }

    const { id } = req.params; // questionId
    const { body, attachments } = req.body;

    if (!body || !body.trim()) {
      res.status(400).json({ success: false, message: 'متن پاسخ الزامی است' });
      return;
    }

    const question = await CommunityQuestion.findOne({ _id: id, status: { $ne: 'deleted' } });
    if (!question) {
      res.status(404).json({ success: false, message: 'سوال مورد نظر یافت نشد یا حذف شده است' });
      return;
    }

    const author = await getAuthorDetails(req);
    const attachmentsList = Array.isArray(attachments) ? attachments : [];

    // Moderation Check
    const moderation = await checkModeration(body.trim(), attachmentsList.length > 0);

    let status: 'active' | 'pending_review' = 'active';
    let moderationReason: string | undefined = undefined;
    let responseMessage = 'پاسخ شما با موفقیت ثبت و منتشر شد';

    if (moderation.isPending) {
      status = 'pending_review';
      moderationReason = moderation.reason;
      if (moderation.reason === 'contains_bad_words') {
        responseMessage = 'پاسخ شما ثبت شد اما به دلیل شناسایی واژگان حساس، پس از بررسی و تأیید ناظر نمایش داده خواهد شد.';
      } else if (moderation.reason === 'contains_image') {
        responseMessage = 'پاسخ شما ثبت شد و به دلیل پیوست تصویر، پس از تأیید ناظر منتشر خواهد شد.';
      }
    }

    const newAnswer = await CommunityAnswer.create({
      question: question._id,
      author: author.authorId,
      authorName: author.authorName,
      authorRole: author.authorRole,
      authorAvatar: author.authorAvatar,
      body: body.trim(),
      attachments: attachmentsList,
      status,
      moderationReason,
    });

    if (status === 'active') {
      await CommunityQuestion.findByIdAndUpdate(question._id, { $inc: { answerCount: 1 } });
    }

    res.status(201).json({
      success: true,
      message: responseMessage,
      data: {
        ...newAnswer.toObject(),
        isOwner: true,
      },
    });
  } catch (err: any) {
    logger.error('Error in createAnswer:', err);
    res.status(500).json({ success: false, message: 'خطا در ثبت پاسخ' });
  }
};

export const updateAnswer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { answerId } = req.params;
    const { body } = req.body;

    const answer = await CommunityAnswer.findById(answerId);
    if (!answer || answer.status === 'deleted') {
      res.status(404).json({ success: false, message: 'پاسخ یافت نشد' });
      return;
    }

    if (answer.author.toString() !== req.user!._id.toString() && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, message: 'شما اجازه ویرایش این پاسخ را ندارید' });
      return;
    }

    if (body && body.trim()) {
      answer.body = body.trim();
      answer.isEdited = true;
      await answer.save();
    }

    res.json({
      success: true,
      message: 'پاسخ با موفقیت ویرایش شد',
      data: answer,
    });
  } catch (err: any) {
    logger.error('Error in updateAnswer:', err);
    res.status(500).json({ success: false, message: 'خطا در ویرایش پاسخ' });
  }
};

export const deleteAnswer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { answerId } = req.params;
    const answer = await CommunityAnswer.findById(answerId);
    if (!answer || answer.status === 'deleted') {
      res.status(404).json({ success: false, message: 'پاسخ یافت نشد' });
      return;
    }

    if (answer.author.toString() !== req.user!._id.toString() && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, message: 'شما اجازه حذف این پاسخ را ندارید' });
      return;
    }

    answer.status = 'deleted';
    await answer.save();

    const q = await CommunityQuestion.findById(answer.question);
    if (q) {
      q.answerCount = Math.max(0, q.answerCount - 1);
      if (q.acceptedAnswer && q.acceptedAnswer.toString() === answer._id.toString()) {
        q.acceptedAnswer = undefined;
        q.isResolved = false;
      }
      await q.save();
    }

    res.json({
      success: true,
      message: 'پاسخ با موفقیت حذف شد',
    });
  } catch (err: any) {
    logger.error('Error in deleteAnswer:', err);
    res.status(500).json({ success: false, message: 'خطا در حذف پاسخ' });
  }
};

export const toggleLikeAnswer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { answerId } = req.params;
    const userId = req.user!._id;

    const answer = await CommunityAnswer.findById(answerId);
    if (!answer || answer.status !== 'active') {
      res.status(404).json({ success: false, message: 'پاسخ یافت نشد' });
      return;
    }

    const hasLiked = answer.likedBy.some((uid) => uid.toString() === userId.toString());
    if (hasLiked) {
      answer.likedBy = answer.likedBy.filter((uid) => uid.toString() !== userId.toString());
      answer.likeCount = Math.max(0, answer.likeCount - 1);
    } else {
      answer.likedBy.push(userId);
      answer.likeCount += 1;
    }

    await answer.save();

    res.json({
      success: true,
      liked: !hasLiked,
      likeCount: answer.likeCount,
      data: {
        liked: !hasLiked,
        likeCount: answer.likeCount,
      },
    });
  } catch (err: any) {
    logger.error('Error in toggleLikeAnswer:', err);
    res.status(500).json({ success: false, message: 'خطا در ثبت واکنش' });
  }
};

export const toggleAcceptAnswer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { answerId } = req.params;
    const answer = await CommunityAnswer.findById(answerId);
    if (!answer || answer.status !== 'active') {
      res.status(404).json({ success: false, message: 'پاسخ یافت نشد' });
      return;
    }

    const question = await CommunityQuestion.findById(answer.question);
    if (!question) {
      res.status(404).json({ success: false, message: 'سوال مرتبط یافت نشد' });
      return;
    }

    // Only question author or admin can accept answer
    if (question.author.toString() !== req.user!._id.toString() && req.user!.role !== 'admin') {
      res.status(403).json({
        success: false,
        message: 'فقط نویسنده سوال می‌تواند یک پاسخ را به عنوان پاسخ منتخب تایید کند',
      });
      return;
    }

    const wasAccepted = answer.isAccepted;

    if (wasAccepted) {
      // Unaccept
      answer.isAccepted = false;
      await answer.save();
      question.acceptedAnswer = undefined;
      question.isResolved = false;
      await question.save();
    } else {
      // Clear previous accepted answer if any
      await CommunityAnswer.updateMany(
        { question: question._id, isAccepted: true },
        { isAccepted: false }
      );
      answer.isAccepted = true;
      await answer.save();
      question.acceptedAnswer = answer._id;
      question.isResolved = true;
      await question.save();
    }

    res.json({
      success: true,
      message: !wasAccepted ? 'پاسخ به عنوان پاسخ منتخب تایید شد ✅' : 'وضعیت پاسخ منتخب لغو شد',
      isAccepted: !wasAccepted,
      isResolved: question.isResolved,
      data: {
        isAccepted: !wasAccepted,
        isResolved: question.isResolved,
      },
    });
  } catch (err: any) {
    logger.error('Error in toggleAcceptAnswer:', err);
    res.status(500).json({ success: false, message: 'خطا در تعیین پاسخ منتخب' });
  }
};

// ----------------------------------------------------------------------------
// POSTS
// ----------------------------------------------------------------------------
export const getPosts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 15));
    const skip = (page - 1) * limit;

    const { search, filter } = req.query;
    const query: any = { status: 'active' };

    if (search && typeof search === 'string' && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ content: regex }, { authorName: regex }, { tags: regex }];
    }

    if (filter === 'my_posts' && req.user) {
      query.author = req.user._id;
    } else if (filter === 'saved' && req.user) {
      query.savedBy = req.user._id;
    }

    const [posts, total] = await Promise.all([
      CommunityPost.find(query).sort({ isPinned: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      CommunityPost.countDocuments(query),
    ]);

    const userIdStr = req.user ? req.user._id.toString() : '';
    const formatted = posts.map((p) => ({
      ...p,
      isLiked: p.likedBy ? p.likedBy.some((uid: any) => uid.toString() === userIdStr) : false,
      isSaved: p.savedBy ? p.savedBy.some((uid: any) => uid.toString() === userIdStr) : false,
      isOwner: p.author.toString() === userIdStr,
      likedBy: undefined,
      savedBy: undefined,
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    logger.error('Error in getPosts:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت پست‌ها' });
  }
};

export const getPostById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'شناسه پست نامعتبر است' });
      return;
    }

    const post = await CommunityPost.findOne({ _id: id, status: 'active' }).lean();
    if (!post) {
      res.status(404).json({ success: false, message: 'پست یافت نشد یا حذف شده است' });
      return;
    }

    const comments = await CommunityComment.find({ post: id, status: 'active' })
      .sort({ createdAt: 1 })
      .lean();

    const userIdStr = req.user ? req.user._id.toString() : '';
    const formattedComments = comments.map((c) => ({
      ...c,
      isOwner: c.author.toString() === userIdStr,
    }));

    const formattedPost = {
      ...post,
      isLiked: post.likedBy ? post.likedBy.some((uid: any) => uid.toString() === userIdStr) : false,
      isSaved: post.savedBy ? post.savedBy.some((uid: any) => uid.toString() === userIdStr) : false,
      isOwner: post.author.toString() === userIdStr,
      comments: formattedComments,
      likedBy: undefined,
      savedBy: undefined,
    };

    res.json({
      success: true,
      data: formattedPost,
    });
  } catch (err: any) {
    logger.error('Error in getPostById:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت جزئیات پست' });
  }
};

export const createPost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (await isUserRestricted(req.user!._id)) {
      res.status(403).json({
        success: false,
        message: '⛔ دسترسی شما به انتشار پست به دلیل تخلف موقتاً مسدود است.',
      });
      return;
    }

    const { content, images, attachments, tags } = req.body;

    if ((!content || !content.trim()) && (!images || images.length === 0)) {
      res.status(400).json({ success: false, message: 'پست باید دارای متن یا تصویر باشد' });
      return;
    }

    const author = await getAuthorDetails(req);

    const newPost = await CommunityPost.create({
      author: author.authorId,
      authorName: author.authorName,
      authorRole: author.authorRole,
      authorAvatar: author.authorAvatar,
      content: content ? content.trim() : '',
      images: Array.isArray(images) ? images : [],
      attachments: Array.isArray(attachments) ? attachments : [],
      tags: Array.isArray(tags) ? tags : [],
    });

    res.status(201).json({
      success: true,
      message: 'پست شما با موفقیت به اشتراک گذاشته شد',
      data: {
        ...newPost.toObject(),
        isLiked: false,
        isSaved: false,
        isOwner: true,
      },
    });
  } catch (err: any) {
    logger.error('Error in createPost:', err);
    res.status(500).json({ success: false, message: 'خطا در ارسال پست' });
  }
};

export const updatePost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const post = await CommunityPost.findById(id);
    if (!post || post.status === 'deleted') {
      res.status(404).json({ success: false, message: 'پست یافت نشد' });
      return;
    }

    if (post.author.toString() !== req.user!._id.toString() && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, message: 'شما اجازه ویرایش این پست را ندارید' });
      return;
    }

    if (content && content.trim()) {
      post.content = content.trim();
      post.isEdited = true;
      await post.save();
    }

    res.json({
      success: true,
      message: 'پست با موفقیت ویرایش شد',
      data: post,
    });
  } catch (err: any) {
    logger.error('Error in updatePost:', err);
    res.status(500).json({ success: false, message: 'خطا در ویرایش پست' });
  }
};

export const deletePost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const post = await CommunityPost.findById(id);
    if (!post || post.status === 'deleted') {
      res.status(404).json({ success: false, message: 'پست یافت نشد' });
      return;
    }

    if (post.author.toString() !== req.user!._id.toString() && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, message: 'شما اجازه حذف این پست را ندارید' });
      return;
    }

    post.status = 'deleted';
    await post.save();

    res.json({
      success: true,
      message: 'پست با موفقیت حذف شد',
    });
  } catch (err: any) {
    logger.error('Error in deletePost:', err);
    res.status(500).json({ success: false, message: 'خطا در حذف پست' });
  }
};

export const toggleLikePost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!._id;

    const post = await CommunityPost.findById(id);
    if (!post || post.status !== 'active') {
      res.status(404).json({ success: false, message: 'پست یافت نشد' });
      return;
    }

    const hasLiked = post.likedBy.some((uid) => uid.toString() === userId.toString());
    if (hasLiked) {
      post.likedBy = post.likedBy.filter((uid) => uid.toString() !== userId.toString());
      post.likeCount = Math.max(0, post.likeCount - 1);
    } else {
      post.likedBy.push(userId);
      post.likeCount += 1;
    }

    await post.save();

    res.json({
      success: true,
      liked: !hasLiked,
      likeCount: post.likeCount,
      data: {
        liked: !hasLiked,
        likeCount: post.likeCount,
      },
    });
  } catch (err: any) {
    logger.error('Error in toggleLikePost:', err);
    res.status(500).json({ success: false, message: 'خطا در ثبت لایک' });
  }
};

export const toggleSavePost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!._id;

    const post = await CommunityPost.findById(id);
    if (!post || post.status !== 'active') {
      res.status(404).json({ success: false, message: 'پست یافت نشد' });
      return;
    }

    const hasSaved = post.savedBy.some((uid) => uid.toString() === userId.toString());
    if (hasSaved) {
      post.savedBy = post.savedBy.filter((uid) => uid.toString() !== userId.toString());
    } else {
      post.savedBy.push(userId);
    }

    await post.save();

    res.json({
      success: true,
      saved: !hasSaved,
      data: {
        saved: !hasSaved,
      },
    });
  } catch (err: any) {
    logger.error('Error in toggleSavePost:', err);
    res.status(500).json({ success: false, message: 'خطا در نشان کردن پست' });
  }
};

// ----------------------------------------------------------------------------
// COMMENTS
// ----------------------------------------------------------------------------
export const createComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (await isUserRestricted(req.user!._id)) {
      res.status(403).json({
        success: false,
        message: '⛔ دسترسی شما به ثبت نظر در جامعه معلمان مسدود است.',
      });
      return;
    }

    const { id } = req.params; // postId
    const { content, replyTo } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({ success: false, message: 'متن نظر الزامی است' });
      return;
    }

    const post = await CommunityPost.findOne({ _id: id, status: 'active' });
    if (!post) {
      res.status(404).json({ success: false, message: 'پست مورد نظر یافت نشد' });
      return;
    }

    const author = await getAuthorDetails(req);

    const newComment = await CommunityComment.create({
      post: post._id,
      author: author.authorId,
      authorName: author.authorName,
      authorRole: author.authorRole,
      authorAvatar: author.authorAvatar,
      content: content.trim(),
      replyTo: replyTo && replyTo.authorName ? replyTo : undefined,
    });

    await CommunityPost.findByIdAndUpdate(post._id, { $inc: { commentCount: 1 } });

    res.status(201).json({
      success: true,
      message: 'نظر شما ثبت شد',
      data: {
        ...newComment.toObject(),
        isOwner: true,
      },
    });
  } catch (err: any) {
    logger.error('Error in createComment:', err);
    res.status(500).json({ success: false, message: 'خطا در ثبت نظر' });
  }
};

export const deleteComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { commentId } = req.params;
    const comment = await CommunityComment.findById(commentId);
    if (!comment || comment.status === 'deleted') {
      res.status(404).json({ success: false, message: 'نظر یافت نشد' });
      return;
    }

    if (comment.author.toString() !== req.user!._id.toString() && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, message: 'شما اجازه حذف این نظر را ندارید' });
      return;
    }

    comment.status = 'deleted';
    await comment.save();

    await CommunityPost.findByIdAndUpdate(comment.post, { $inc: { commentCount: -1 } });

    res.json({
      success: true,
      message: 'نظر با موفقیت حذف شد',
    });
  } catch (err: any) {
    logger.error('Error in deleteComment:', err);
    res.status(500).json({ success: false, message: 'خطا در حذف نظر' });
  }
};

// ----------------------------------------------------------------------------
// REPORTS
// ----------------------------------------------------------------------------
export const submitReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { targetType, targetId, reason, description } = req.body;

    if (!['question', 'answer', 'post', 'comment'].includes(targetType)) {
      res.status(400).json({ success: false, message: 'نوع مورد گزارش‌شده نامعتبر است' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      res.status(400).json({ success: false, message: 'شناسه مورد گزارش‌شده نامعتبر است' });
      return;
    }
    if (!reason) {
      res.status(400).json({ success: false, message: 'علت گزارش الزامی است' });
      return;
    }

    const reporter = await getAuthorDetails(req);

    // Upsert report to avoid duplicate report spam from same user
    const existing = await CommunityReport.findOne({
      targetType,
      targetId,
      reporter: reporter.authorId,
    });

    if (existing) {
      res.json({
        success: true,
        message: 'گزارش شما قبلاً برای این محتوا ثبت شده و توسط مدیران بررسی خواهد شد',
      });
      return;
    }

    await CommunityReport.create({
      targetType,
      targetId,
      reporter: reporter.authorId,
      reporterName: reporter.authorName,
      reason,
      description: description || '',
    });

    // Increment report count on target model
    if (targetType === 'question') {
      await CommunityQuestion.findByIdAndUpdate(targetId, { $inc: { reportCount: 1 } });
    } else if (targetType === 'answer') {
      await CommunityAnswer.findByIdAndUpdate(targetId, { $inc: { reportCount: 1 } });
    } else if (targetType === 'post') {
      await CommunityPost.findByIdAndUpdate(targetId, { $inc: { reportCount: 1 } });
    } else if (targetType === 'comment') {
      await CommunityComment.findByIdAndUpdate(targetId, { $inc: { reportCount: 1 } });
    }

    res.status(201).json({
      success: true,
      message: 'گزارش تخلف شما ثبت شد و با اولویت توسط ناظران کیتایار بررسی خواهد شد 🙏',
    });
  } catch (err: any) {
    logger.error('Error in submitReport:', err);
    res.status(500).json({ success: false, message: 'خطا در ثبت گزارش' });
  }
};
