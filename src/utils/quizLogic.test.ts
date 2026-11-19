import assert from 'node:assert/strict'
import { DEFAULT_QUIZ_BOTS, IQuizBotProfile } from '../core/models/QuizConfig.js'
import { QuizGameEngineService } from '../modules/student/services/quizGameEngine.service.js'

// 1. Default 3-tier bots check (Weak / Medium / Strong)
assert.equal(DEFAULT_QUIZ_BOTS.length, 3, 'Should define 3 default bot difficulty models')
assert.deepEqual(
  DEFAULT_QUIZ_BOTS.map((b) => b.difficulty).sort(),
  ['easy', 'hard', 'medium'],
  'Default bots should include easy, medium, and hard models'
)

// 2. Bot selection honors active bots & difficulty distribution
const customBots: IQuizBotProfile[] = [
  { id: 'b1', name: 'ربات تست ضعیف', avatar: 'avatar_opp1', difficulty: 'easy', isActive: false },
  { id: 'b2', name: 'ربات تست قوی', avatar: 'avatar_opp3', difficulty: 'hard', isActive: true },
]
const selected = (QuizGameEngineService as any).selectBot({
  bots: customBots,
  botDistribution: { easy: 100, medium: 0, hard: 0 },
})
assert.equal(selected.id, 'b2', 'Inactive bot must be excluded even when easy weight is 100%')
assert.equal(selected.difficulty, 'hard')

console.log('✅ quizLogic.test.ts passed all assertions')
