import { Response } from 'express';
import { AuthRequest } from '../../../core/middleware/auth.js';
import { CommunityCategory } from '../../../core/models/CommunityCategory.js';
import { CommunityQuestion } from '../../../core/models/CommunityQuestion.js';
import { CommunityAnswer } from '../../../core/models/CommunityAnswer.js';
import { CommunityPost } from '../../../core/models/CommunityPost.js';
import { CommunityComment } from '../../../core/models/CommunityComment.js';
import { CommunityReport } from '../../../core/models/CommunityReport.js';
import { CommunityRestriction } from '../../../core/models/CommunityRestriction.js';
import { CommunityAuditLog } from '../../../core/models/CommunityAuditLog.js';
import { CommunitySettings } from '../../../core/models/CommunitySettings.js';
import { User } from '../../../core/models/User.js';
import { logger } from '../../../core/utils/logger.js';
import mongoose from 'mongoose';

// Helper to record audit log
const recordAuditLog = async (
  req: AuthRequest,
  action: string,
  targetType: string,
  targetId?: string,
  details?: any
) => {
  try {
    const actorId = req.user ? req.user._id : new mongoose.Types.ObjectId();
    const actorName = req.user ? (req.user.fullName || req.user.username) : 'ادمین';
    await CommunityAuditLog.create({
      actor: actorId,
      actorName,
      action,
      targetType,
      targetId: targetId || '',
      details: details || {},
    });
  } catch (e) {
    logger.error('Failed to write audit log:', e);
  }
};

// ----------------------------------------------------------------------------
// 1. DASHBOARD & METRICS
// ----------------------------------------------------------------------------
export const getDashboardMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [
      totalQuestions,
      activeQuestions,
      resolvedQuestions,
      unansweredQuestions,
      totalAnswers,
      totalPosts,
      activePosts,
      totalComments,
      openReports,
      totalCategories,
      activeRestrictions,
      recentQuestions,
      recentPosts,
      recentReports,
    ] = await Promise.all([
      CommunityQuestion.countDocuments({ status: { $ne: 'deleted' } }),
      CommunityQuestion.countDocuments({ status: 'active' }),
      CommunityQuestion.countDocuments({ status: 'active', isResolved: true }),
      CommunityQuestion.countDocuments({ status: 'active', answerCount: 0 }),
      CommunityAnswer.countDocuments({ status: { $ne: 'deleted' } }),
      CommunityPost.countDocuments({ status: { $ne: 'deleted' } }),
      CommunityPost.countDocuments({ status: 'active' }),
      CommunityComment.countDocuments({ status: { $ne: 'deleted' } }),
      CommunityReport.countDocuments({ status: 'pending' }),
      CommunityCategory.countDocuments(),
      CommunityRestriction.countDocuments({ isActive: true }),
      CommunityQuestion.find({ status: { $ne: 'deleted' } })
        .populate('category', 'name color')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      CommunityPost.find({ status: { $ne: 'deleted' } })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      CommunityReport.find({ status: 'pending' })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        totalQuestions,
        activeQuestions,
        resolvedQuestions,
        unansweredQuestions,
        totalAnswers,
        totalPosts,
        activePosts,
        totalComments,
        pendingReports: openReports,
        openReports,
        totalCategories,
        activeRestrictions,
        stats: {
          totalQuestions,
          activeQuestions,
          resolvedQuestions,
          unansweredQuestions,
          totalAnswers,
          totalPosts,
          activePosts,
          totalComments,
          openReports,
          totalCategories,
          activeRestrictions,
        },
        recentQuestions,
        recentPosts,
        recentReports,
      },
    });
  } catch (err: any) {
    logger.error('Error in getDashboardMetrics:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت آمار جامعه معلمان' });
  }
};

// ----------------------------------------------------------------------------
// 2. CATEGORY MANAGEMENT
// ----------------------------------------------------------------------------
export const getAdminCategories = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const categories = await CommunityCategory.find().sort({ order: 1, createdAt: 1 }).lean();

    // Calculate real live question count for each category
    const withLiveCounts = await Promise.all(
      categories.map(async (cat) => {
        const liveCount = await CommunityQuestion.countDocuments({
          category: cat._id,
          status: { $ne: 'deleted' },
        });
        return {
          ...cat,
          questionCount: liveCount,
        };
      })
    );

    res.json({
      success: true,
      data: withLiveCounts,
    });
  } catch (err: any) {
    logger.error('Error in getAdminCategories:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت دسته‌بندی‌ها' });
  }
};

export const createAdminCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, slug, description, icon, color, order, isActive } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ success: false, message: 'نام دسته‌بندی الزامی است' });
      return;
    }

    const cleanSlug = slug && slug.trim()
      ? slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
      : `cat-${Date.now()}`;

    const existing = await CommunityCategory.findOne({ slug: cleanSlug });
    if (existing) {
      res.status(400).json({ success: false, message: 'شناسه یکتا (slug) تکراری است' });
      return;
    }

    const maxOrderDoc = await CommunityCategory.findOne().sort({ order: -1 });
    const nextOrder = typeof order === 'number' ? order : (maxOrderDoc ? maxOrderDoc.order + 1 : 1);

    const category = await CommunityCategory.create({
      name: name.trim(),
      slug: cleanSlug,
      description: description ? description.trim() : '',
      icon: icon || 'MessageCircleQuestion',
      color: color || '#3B82F6',
      order: nextOrder,
      isActive: isActive !== false,
    });

    await recordAuditLog(req, 'CATEGORY_CREATE', 'category', category._id.toString(), { name: category.name });

    res.status(201).json({
      success: true,
      message: 'دسته‌بندی با موفقیت ایجاد شد',
      data: category,
    });
  } catch (err: any) {
    logger.error('Error in createAdminCategory:', err);
    res.status(500).json({ success: false, message: 'خطا در ایجاد دسته‌بندی' });
  }
};

export const updateAdminCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, slug, description, icon, color, order, isActive } = req.body;

    const category = await CommunityCategory.findById(id);
    if (!category) {
      res.status(404).json({ success: false, message: 'دسته‌بندی یافت نشد' });
      return;
    }

    if (name) category.name = name.trim();
    if (slug) {
      const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const conflict = await CommunityCategory.findOne({ slug: cleanSlug, _id: { $ne: id } });
      if (conflict) {
        res.status(400).json({ success: false, message: 'شناسه یکتا (slug) تکراری است' });
        return;
      }
      category.slug = cleanSlug;
    }
    if (description !== undefined) category.description = description.trim();
    if (icon) category.icon = icon;
    if (color) category.color = color;
    if (typeof order === 'number') category.order = order;
    if (typeof isActive === 'boolean') category.isActive = isActive;

    await category.save();

    await recordAuditLog(req, 'CATEGORY_UPDATE', 'category', category._id.toString(), { name: category.name });

    res.json({
      success: true,
      message: 'دسته‌بندی با موفقیت بروزرسانی شد',
      data: category,
    });
  } catch (err: any) {
    logger.error('Error in updateAdminCategory:', err);
    res.status(500).json({ success: false, message: 'خطا در ویرایش دسته‌بندی' });
  }
};

export const deleteAdminCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { reassignToCategoryId } = req.body;

    const category = await CommunityCategory.findById(id);
    if (!category) {
      res.status(404).json({ success: false, message: 'دسته‌بندی یافت نشد' });
      return;
    }

    const questionCount = await CommunityQuestion.countDocuments({ category: id, status: { $ne: 'deleted' } });

    if (questionCount > 0) {
      if (!reassignToCategoryId || !mongoose.Types.ObjectId.isValid(reassignToCategoryId)) {
        res.status(400).json({
          success: false,
          code: 'HAS_QUESTIONS',
          message: `این دسته‌بندی دارای ${questionCount} سوال است. لطفاً برای حذف، یک دسته‌بندی جایگزین برای انتقال سوالات انتخاب کنید.`,
          questionCount,
        });
        return;
      }

      const targetCat = await CommunityCategory.findById(reassignToCategoryId);
      if (!targetCat || targetCat._id.toString() === id) {
        res.status(400).json({ success: false, message: 'دسته‌بندی جایگزین نامعتبر است' });
        return;
      }

      // Reassign all questions
      await CommunityQuestion.updateMany({ category: id }, { category: targetCat._id });
      await CommunityCategory.findByIdAndUpdate(targetCat._id, { $inc: { questionCount } });
    }

    await CommunityCategory.findByIdAndDelete(id);

    await recordAuditLog(req, 'CATEGORY_DELETE', 'category', id, { name: category.name });

    res.json({
      success: true,
      message: 'دسته‌بندی با موفقیت حذف شد',
    });
  } catch (err: any) {
    logger.error('Error in deleteAdminCategory:', err);
    res.status(500).json({ success: false, message: 'خطا در حذف دسته‌بندی' });
  }
};

export const reorderAdminCategories = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      res.status(400).json({ success: false, message: 'لیست شناسه‌ها نامعتبر است' });
      return;
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        CommunityCategory.findByIdAndUpdate(id, { order: index + 1 })
      )
    );

    res.json({
      success: true,
      message: 'ترتیب دسته‌بندی‌ها با موفقیت ذخیره شد',
    });
  } catch (err: any) {
    logger.error('Error in reorderAdminCategories:', err);
    res.status(500).json({ success: false, message: 'خطا در مرتب‌سازی دسته‌بندی‌ها' });
  }
};

// ----------------------------------------------------------------------------
// 3. QUESTIONS MODERATION
// ----------------------------------------------------------------------------
export const getAdminQuestions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { status, category, search } = req.query;
    const query: any = {};

    if (status && status !== 'all') {
      query.status = status;
    } else {
      query.status = { $ne: 'deleted' };
    }

    if (category && category !== 'all' && mongoose.Types.ObjectId.isValid(category as string)) {
      query.category = category;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: regex }, { body: regex }, { authorName: regex }];
    }

    const [questions, total] = await Promise.all([
      CommunityQuestion.find(query)
        .populate('category', 'name color')
        .sort({ isPinned: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CommunityQuestion.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: questions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    logger.error('Error in getAdminQuestions:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت سوالات' });
  }
};

export const updateAdminQuestionStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { status, isPinned, isResolved } = req.body;

    const question = await CommunityQuestion.findById(id);
    if (!question) {
      res.status(404).json({ success: false, message: 'سوال یافت نشد' });
      return;
    }

    const previousStatus = question.status;
    if (status && ['active', 'pending_review', 'hidden', 'deleted'].includes(status)) {
      question.status = status;
      if (status === 'active' && previousStatus === 'pending_review') {
        question.moderationReason = undefined;
        await CommunityCategory.findByIdAndUpdate(question.category, { $inc: { questionCount: 1 } });
      } else if (status === 'deleted' && previousStatus === 'active') {
        await CommunityCategory.findByIdAndUpdate(question.category, { $inc: { questionCount: -1 } });
      }
    }
    if (typeof isPinned === 'boolean') question.isPinned = isPinned;
    if (typeof isResolved === 'boolean') question.isResolved = isResolved;

    await question.save();

    await recordAuditLog(req, 'QUESTION_STATUS_CHANGE', 'question', id, {
      from: previousStatus,
      to: question.status,
      isPinned: question.isPinned,
    });

    res.json({
      success: true,
      message: 'وضعیت سوال بروزرسانی شد',
      data: question,
    });
  } catch (err: any) {
    logger.error('Error in updateAdminQuestionStatus:', err);
    res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت سوال' });
  }
};

// ----------------------------------------------------------------------------
// 4. ANSWERS MODERATION
// ----------------------------------------------------------------------------
export const getAdminAnswers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { questionId, status, search } = req.query;
    const query: any = {};

    if (questionId && mongoose.Types.ObjectId.isValid(questionId as string)) {
      query.question = questionId;
    }
    if (status && status !== 'all') {
      query.status = status;
    } else {
      query.status = { $ne: 'deleted' };
    }
    if (search && typeof search === 'string' && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ body: regex }, { authorName: regex }];
    }

    const [answers, total] = await Promise.all([
      CommunityAnswer.find(query)
        .populate('question', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CommunityAnswer.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: answers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    logger.error('Error in getAdminAnswers:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت پاسخ‌ها' });
  }
};

export const updateAdminAnswerStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    const answer = await CommunityAnswer.findById(id);
    if (!answer) {
      res.status(404).json({ success: false, message: 'پاسخ یافت نشد' });
      return;
    }

    const previousStatus = answer.status;
    if (['active', 'pending_review', 'hidden', 'deleted'].includes(status)) {
      answer.status = status;
      if (status === 'active' && previousStatus === 'pending_review') {
        answer.moderationReason = undefined;
        await CommunityQuestion.findByIdAndUpdate(answer.question, { $inc: { answerCount: 1 } });
      } else if (status === 'deleted' && previousStatus === 'active') {
        await CommunityQuestion.findByIdAndUpdate(answer.question, { $inc: { answerCount: -1 } });
      }
      await answer.save();

      await recordAuditLog(req, 'ANSWER_STATUS_CHANGE', 'answer', id, { status });
    }

    res.json({
      success: true,
      message: 'وضعیت پاسخ بروزرسانی شد',
      data: answer,
    });
  } catch (err: any) {
    logger.error('Error in updateAdminAnswerStatus:', err);
    res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت پاسخ' });
  }
};

// ----------------------------------------------------------------------------
// 5. POSTS MODERATION
// ----------------------------------------------------------------------------
export const getAdminPosts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { status, search } = req.query;
    const query: any = {};

    if (status && status !== 'all') {
      query.status = status;
    } else {
      query.status = { $ne: 'deleted' };
    }

    if (search && typeof search === 'string' && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ content: regex }, { authorName: regex }];
    }

    const [posts, total] = await Promise.all([
      CommunityPost.find(query).sort({ isPinned: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      CommunityPost.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: posts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    logger.error('Error in getAdminPosts:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت پست‌ها' });
  }
};

export const updateAdminPostStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { status, isPinned } = req.body;

    const post = await CommunityPost.findById(id);
    if (!post) {
      res.status(404).json({ success: false, message: 'پست یافت نشد' });
      return;
    }

    const prevStatus = post.status;
    if (status && ['active', 'hidden', 'deleted'].includes(status)) {
      post.status = status;
    }
    if (typeof isPinned === 'boolean') post.isPinned = isPinned;

    await post.save();

    await recordAuditLog(req, 'POST_STATUS_CHANGE', 'post', id, {
      from: prevStatus,
      to: post.status,
      isPinned: post.isPinned,
    });

    res.json({
      success: true,
      message: 'وضعیت پست بروزرسانی شد',
      data: post,
    });
  } catch (err: any) {
    logger.error('Error in updateAdminPostStatus:', err);
    res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت پست' });
  }
};

// ----------------------------------------------------------------------------
// 6. COMMENTS MODERATION
// ----------------------------------------------------------------------------
export const getAdminComments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { postId, status, search } = req.query;
    const query: any = {};

    if (postId && mongoose.Types.ObjectId.isValid(postId as string)) {
      query.post = postId;
    }
    if (status && status !== 'all') {
      query.status = status;
    } else {
      query.status = { $ne: 'deleted' };
    }
    if (search && typeof search === 'string' && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ content: regex }, { authorName: regex }];
    }

    const [comments, total] = await Promise.all([
      CommunityComment.find(query)
        .populate('post', 'content authorName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CommunityComment.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: comments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    logger.error('Error in getAdminComments:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت نظرات' });
  }
};

export const updateAdminCommentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    const comment = await CommunityComment.findById(id);
    if (!comment) {
      res.status(404).json({ success: false, message: 'نظر یافت نشد' });
      return;
    }

    if (['active', 'hidden', 'deleted'].includes(status)) {
      comment.status = status;
      await comment.save();

      await recordAuditLog(req, 'COMMENT_STATUS_CHANGE', 'comment', id, { status });
    }

    res.json({
      success: true,
      message: 'وضعیت نظر بروزرسانی شد',
      data: comment,
    });
  } catch (err: any) {
    logger.error('Error in updateAdminCommentStatus:', err);
    res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت نظر' });
  }
};

// ----------------------------------------------------------------------------
// 7. REPORTS QUEUE MODERATION
// ----------------------------------------------------------------------------
export const getAdminReports = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { status, targetType } = req.query;
    const query: any = {};

    if (status && status !== 'all') {
      query.status = status;
    }
    if (targetType && targetType !== 'all') {
      query.targetType = targetType;
    }

    const [reports, total] = await Promise.all([
      CommunityReport.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CommunityReport.countDocuments(query),
    ]);

    // Attach target snippet
    const enrichedReports = await Promise.all(
      reports.map(async (r) => {
        let snippet = '';
        let targetAuthor = '';
        let authorId = null;

        if (r.targetType === 'question') {
          const q = await CommunityQuestion.findById(r.targetId).select('title body author authorName status').lean();
          if (q) {
            snippet = q.title;
            targetAuthor = q.authorName;
            authorId = q.author;
          }
        } else if (r.targetType === 'answer') {
          const a = await CommunityAnswer.findById(r.targetId).select('body author authorName status').lean();
          if (a) {
            snippet = a.body;
            targetAuthor = a.authorName;
            authorId = a.author;
          }
        } else if (r.targetType === 'post') {
          const p = await CommunityPost.findById(r.targetId).select('content author authorName status').lean();
          if (p) {
            snippet = p.content;
            targetAuthor = p.authorName;
            authorId = p.author;
          }
        } else if (r.targetType === 'comment') {
          const c = await CommunityComment.findById(r.targetId).select('content author authorName status').lean();
          if (c) {
            snippet = c.content;
            targetAuthor = c.authorName;
            authorId = c.author;
          }
        }

        return {
          ...r,
          targetSnippet: snippet || '(محتوا حذف شده یا یافت نشد)',
          targetAuthor: targetAuthor || 'نامشخص',
          targetAuthorId: authorId,
        };
      })
    );

    res.json({
      success: true,
      data: enrichedReports,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    logger.error('Error in getAdminReports:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت گزارش‌ها' });
  }
};

export const resolveAdminReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { status, moderatorNotes, actionTaken } = req.body;

    const report = await CommunityReport.findById(id);
    if (!report) {
      res.status(404).json({ success: false, message: 'گزارش یافت نشد' });
      return;
    }

    report.status = status || 'action_taken';
    if (moderatorNotes) report.moderatorNotes = moderatorNotes;
    if (actionTaken) report.actionTaken = actionTaken;
    report.moderatedBy = req.user!._id;

    await report.save();

    // Execute content moderation action if specified
    if (actionTaken === 'hidden' || actionTaken === 'deleted') {
      const newStatus = actionTaken;
      if (report.targetType === 'question') {
        await CommunityQuestion.findByIdAndUpdate(report.targetId, { status: newStatus });
      } else if (report.targetType === 'answer') {
        await CommunityAnswer.findByIdAndUpdate(report.targetId, { status: newStatus });
      } else if (report.targetType === 'post') {
        await CommunityPost.findByIdAndUpdate(report.targetId, { status: newStatus });
      } else if (report.targetType === 'comment') {
        await CommunityComment.findByIdAndUpdate(report.targetId, { status: newStatus });
      }
    }

    await recordAuditLog(req, 'REPORT_RESOLVE', 'report', id, {
      status: report.status,
      actionTaken: report.actionTaken,
      targetType: report.targetType,
      targetId: report.targetId,
    });

    res.json({
      success: true,
      message: 'گزارش با موفقیت بررسی و نتیجه ثبت شد',
      data: report,
    });
  } catch (err: any) {
    logger.error('Error in resolveAdminReport:', err);
    res.status(500).json({ success: false, message: 'خطا در ثبت نتیجه گزارش' });
  }
};

// ----------------------------------------------------------------------------
// 8. RESTRICTIONS & AUDIT LOGS
// ----------------------------------------------------------------------------
export const getAdminRestrictions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const restrictions = await CommunityRestriction.find()
      .populate('user', 'fullName username phoneNumber')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: restrictions,
    });
  } catch (err: any) {
    logger.error('Error in getAdminRestrictions:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت محدودیت‌ها' });
  }
};

export const createAdminRestriction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, reason, durationDays } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ success: false, message: 'شناسه کاربر نامعتبر است' });
      return;
    }
    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, message: 'علت محدودیت الزامی است' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
      return;
    }

    let expiresAt: Date | null = null;
    if (durationDays && Number(durationDays) > 0) {
      expiresAt = new Date(Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000);
    }

    // Deactivate previous active restrictions for this user
    await CommunityRestriction.updateMany({ user: userId }, { isActive: false });

    const restriction = await CommunityRestriction.create({
      user: userId,
      userName: user.fullName || user.username,
      userPhone: user.phoneNumber || '',
      restrictedBy: req.user!._id,
      reason: reason.trim(),
      expiresAt,
      isActive: true,
    });

    await recordAuditLog(req, 'USER_RESTRICT', 'user', userId, {
      userName: user.fullName,
      reason,
      durationDays,
    });

    res.status(201).json({
      success: true,
      message: 'محدودیت دسترسی کاربر در تالار گفتگو با موفقیت اعمال شد',
      data: restriction,
    });
  } catch (err: any) {
    logger.error('Error in createAdminRestriction:', err);
    res.status(500).json({ success: false, message: 'خطا در اعمال محدودیت' });
  }
};

export const removeAdminRestriction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const restriction = await CommunityRestriction.findById(id);
    if (!restriction) {
      res.status(404).json({ success: false, message: 'محدودیت یافت نشد' });
      return;
    }

    restriction.isActive = false;
    await restriction.save();

    await recordAuditLog(req, 'USER_UNRESTRICT', 'user', restriction.user.toString(), {
      userName: restriction.userName,
    });

    res.json({
      success: true,
      message: 'محدودیت کاربر با موفقیت برطرف شد',
    });
  } catch (err: any) {
    logger.error('Error in removeAdminRestriction:', err);
    res.status(500).json({ success: false, message: 'خطا در رفع محدودیت' });
  }
};

export const getAdminAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      CommunityAuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CommunityAuditLog.countDocuments(),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    logger.error('Error in getAdminAuditLogs:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت وقایع نظارتی' });
  }
};

// ----------------------------------------------------------------------------
// 9. FORBIDDEN WORDS & MODERATION SETTINGS
// ----------------------------------------------------------------------------
export const getCommunitySettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let settings = await CommunitySettings.findOne({ key: 'default' });
    if (!settings) {
      settings = await CommunitySettings.create({ key: 'default' });
    }
    res.json({
      success: true,
      data: settings,
    });
  } catch (err: any) {
    logger.error('Error in getCommunitySettings:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات تالار' });
  }
};

export const updateCommunitySettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { forbiddenWords, autoApproveText, requireApprovalForImages } = req.body;
    let settings = await CommunitySettings.findOne({ key: 'default' });
    if (!settings) {
      settings = await CommunitySettings.create({ key: 'default' });
    }

    if (Array.isArray(forbiddenWords)) {
      settings.forbiddenWords = forbiddenWords.map((w: string) => String(w).trim()).filter(Boolean);
    }
    if (typeof autoApproveText === 'boolean') settings.autoApproveText = autoApproveText;
    if (typeof requireApprovalForImages === 'boolean') settings.requireApprovalForImages = requireApprovalForImages;

    await settings.save();
    await recordAuditLog(req, 'SETTINGS_UPDATE', 'community_settings', settings._id.toString(), {
      wordsCount: settings.forbiddenWords.length,
      autoApproveText: settings.autoApproveText,
      requireApprovalForImages: settings.requireApprovalForImages,
    });

    res.json({
      success: true,
      message: 'تنظیمات تالار با موفقیت ذخیره شد',
      data: settings,
    });
  } catch (err: any) {
    logger.error('Error in updateCommunitySettings:', err);
    res.status(500).json({ success: false, message: 'خطا در بروزرسانی تنظیمات' });
  }
};

export const addForbiddenWord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { word } = req.body;
    if (!word || !word.trim()) {
      res.status(400).json({ success: false, message: 'کلمه الزامی است' });
      return;
    }
    const cleanWord = word.trim().toLowerCase();
    let settings = await CommunitySettings.findOne({ key: 'default' });
    if (!settings) {
      settings = await CommunitySettings.create({ key: 'default' });
    }

    if (!settings.forbiddenWords.includes(cleanWord)) {
      settings.forbiddenWords.push(cleanWord);
      await settings.save();
      await recordAuditLog(req, 'FORBIDDEN_WORD_ADD', 'community_settings', '', { word: cleanWord });
    }

    res.json({
      success: true,
      message: `کلمه «${cleanWord}» به فهرست کلمات ممنوعه اضافه شد`,
      data: settings.forbiddenWords,
    });
  } catch (err: any) {
    logger.error('Error in addForbiddenWord:', err);
    res.status(500).json({ success: false, message: 'خطا در افزودن کلمه ممنوعه' });
  }
};

export const removeForbiddenWord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { word } = req.params;
    if (!word) {
      res.status(400).json({ success: false, message: 'کلمه الزامی است' });
      return;
    }
    const rawWord = Array.isArray(word) ? word[0] : word;
    const cleanWord = decodeURIComponent(String(rawWord)).trim().toLowerCase();
    let settings = await CommunitySettings.findOne({ key: 'default' });
    if (!settings) {
      settings = await CommunitySettings.create({ key: 'default' });
    }

    settings.forbiddenWords = settings.forbiddenWords.filter((w) => w.toLowerCase() !== cleanWord);
    await settings.save();
    await recordAuditLog(req, 'FORBIDDEN_WORD_REMOVE', 'community_settings', '', { word: cleanWord });

    res.json({
      success: true,
      message: `کلمه «${cleanWord}» از فهرست کلمات ممنوعه حذف شد`,
      data: settings.forbiddenWords,
    });
  } catch (err: any) {
    logger.error('Error in removeForbiddenWord:', err);
    res.status(500).json({ success: false, message: 'خطا در حذف کلمه ممنوعه' });
  }
};

export const approveQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const question = await CommunityQuestion.findById(id);
    if (!question) {
      res.status(404).json({ success: false, message: 'سوال یافت نشد' });
      return;
    }

    const wasPending = question.status === 'pending_review';
    question.status = 'active';
    question.moderationReason = undefined;
    await question.save();

    if (wasPending) {
      await CommunityCategory.findByIdAndUpdate(question.category, { $inc: { questionCount: 1 } });
    }

    await recordAuditLog(req, 'QUESTION_APPROVE', 'question', id, { title: question.title });

    res.json({
      success: true,
      message: 'پرسش با موفقیت تأیید و در تالار گفتگو منتشر شد',
      data: question,
    });
  } catch (err: any) {
    logger.error('Error in approveQuestion:', err);
    res.status(500).json({ success: false, message: 'خطا در تایید پرسش' });
  }
};

export const approveAnswer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const answer = await CommunityAnswer.findById(id);
    if (!answer) {
      res.status(404).json({ success: false, message: 'پاسخ یافت نشد' });
      return;
    }

    const wasPending = answer.status === 'pending_review';
    answer.status = 'active';
    answer.moderationReason = undefined;
    await answer.save();

    if (wasPending) {
      await CommunityQuestion.findByIdAndUpdate(answer.question, { $inc: { answerCount: 1 } });
    }

    await recordAuditLog(req, 'ANSWER_APPROVE', 'answer', id, {});

    res.json({
      success: true,
      message: 'پاسخ با موفقیت تأیید و منتشر شد',
      data: answer,
    });
  } catch (err: any) {
    logger.error('Error in approveAnswer:', err);
    res.status(500).json({ success: false, message: 'خطا در تایید پاسخ' });
  }
};

export const getPendingReviews = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [pendingQuestions, pendingAnswers] = await Promise.all([
      CommunityQuestion.find({ status: 'pending_review' })
        .populate('category', 'name color')
        .sort({ createdAt: -1 })
        .lean(),
      CommunityAnswer.find({ status: 'pending_review' })
        .populate('question', 'title')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        questions: pendingQuestions,
        answers: pendingAnswers,
        total: pendingQuestions.length + pendingAnswers.length,
      },
    });
  } catch (err: any) {
    logger.error('Error in getPendingReviews:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت موارد در انتظار بررسی' });
  }
};

