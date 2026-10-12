import { Router } from 'express';
import { protect, adminOnly } from '../../../core/middleware/auth.js';
import * as adminCommunityController from '../controllers/admin.community.controller.js';

const router = Router();

// All routes require admin protection
router.use(protect);
router.use(adminOnly);

// 1. Dashboard Metrics & Stats
router.get('/dashboard', adminCommunityController.getDashboardMetrics);
router.get('/stats', adminCommunityController.getDashboardMetrics);

// 2. Categories
router.get('/categories', adminCommunityController.getAdminCategories);
router.post('/categories', adminCommunityController.createAdminCategory);
router.put('/categories/reorder', adminCommunityController.reorderAdminCategories);
router.post('/categories/reorder', adminCommunityController.reorderAdminCategories);
router.put('/categories/:id', adminCommunityController.updateAdminCategory);
router.delete('/categories/:id', adminCommunityController.deleteAdminCategory);

// 3. Questions Moderation
router.get('/questions', adminCommunityController.getAdminQuestions);
router.put('/questions/:id/approve', adminCommunityController.approveQuestion);
router.put('/questions/:id/status', adminCommunityController.updateAdminQuestionStatus);
router.patch('/questions/:id/status', adminCommunityController.updateAdminQuestionStatus);

// 4. Answers Moderation
router.get('/answers', adminCommunityController.getAdminAnswers);
router.put('/answers/:id/approve', adminCommunityController.approveAnswer);
router.put('/answers/:id/status', adminCommunityController.updateAdminAnswerStatus);
router.patch('/answers/:id/status', adminCommunityController.updateAdminAnswerStatus);

// Pending Review Queue
router.get('/pending-reviews', adminCommunityController.getPendingReviews);

// Community Settings & Forbidden Words
router.get('/settings', adminCommunityController.getCommunitySettings);
router.put('/settings', adminCommunityController.updateCommunitySettings);
router.post('/forbidden-words', adminCommunityController.addForbiddenWord);
router.delete('/forbidden-words/:word', adminCommunityController.removeForbiddenWord);

// 5. Posts Moderation
router.get('/posts', adminCommunityController.getAdminPosts);
router.put('/posts/:id/status', adminCommunityController.updateAdminPostStatus);
router.patch('/posts/:id/status', adminCommunityController.updateAdminPostStatus);

// 6. Comments Moderation
router.get('/comments', adminCommunityController.getAdminComments);
router.put('/comments/:id/status', adminCommunityController.updateAdminCommentStatus);
router.patch('/comments/:id/status', adminCommunityController.updateAdminCommentStatus);

// 7. Reports Queue Moderation
router.get('/reports', adminCommunityController.getAdminReports);
router.put('/reports/:id/resolve', adminCommunityController.resolveAdminReport);
router.put('/reports/:id', adminCommunityController.resolveAdminReport);
router.patch('/reports/:id/resolve', adminCommunityController.resolveAdminReport);
router.patch('/reports/:id', adminCommunityController.resolveAdminReport);

// 8. Restrictions & Audit Logs
router.get('/restrictions', adminCommunityController.getAdminRestrictions);
router.post('/restrictions', adminCommunityController.createAdminRestriction);
router.delete('/restrictions/:id', adminCommunityController.removeAdminRestriction);
router.get('/audit-logs', adminCommunityController.getAdminAuditLogs);

export default router;
