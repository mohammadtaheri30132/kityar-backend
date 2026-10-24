import { Router } from 'express';
import {
  getRankEstimateFields,
  getRankEstimateRegions,
  getFieldEntranceExams,
  getExamGradeLessons,
  calculateRankEstimate,
} from '../controllers/public.rankEstimate.controller.js';

const router = Router();

router.get('/fields', getRankEstimateFields);
router.get('/regions', getRankEstimateRegions);
router.get('/fields/:fieldId/entrance-exams', getFieldEntranceExams);
router.get('/entrance-exams/:examId/grade-lessons', getExamGradeLessons);
router.post('/result', calculateRankEstimate);

export default router;
