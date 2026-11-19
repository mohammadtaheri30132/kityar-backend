import { Router } from 'express'
import { protect, studentOnly } from '../../../core/middleware/auth.js'
import { StudentFlashcardController } from '../controllers/student.flashcard.controller.js'
import { StudentFlashcardSocialController } from '../controllers/student.flashcardSocial.controller.js'

const router = Router()

router.use(protect)
router.use(studentOnly)

router.get('/sync', StudentFlashcardController.pullSync)
router.post('/sync', StudentFlashcardController.pushSync)

router.post('/share', StudentFlashcardSocialController.shareDeck)
router.get('/shared', StudentFlashcardSocialController.browseSharedDecks)
router.post('/shared/:code/clone', StudentFlashcardSocialController.cloneSharedDeck)
router.post('/shared/:code/rate', StudentFlashcardSocialController.rateSharedDeck)
router.post('/shared/:code/report', StudentFlashcardSocialController.reportSharedDeck)
router.post('/collab/:code/cards', StudentFlashcardSocialController.contributeCollabCards)

router.get('/league', StudentFlashcardSocialController.getWeeklyLeague)

router.get('/challenges', StudentFlashcardSocialController.listChallenges)
router.post('/challenges', StudentFlashcardSocialController.createChallenge)
router.get('/challenges/:code', StudentFlashcardSocialController.getChallengeByCode)
router.post('/challenges/:code/submit', StudentFlashcardSocialController.submitChallenge)

export default router
