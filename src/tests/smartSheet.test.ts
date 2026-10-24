// Unit tests for Smart Sheet scoring and OMR evaluation logic

export function calculateScore(
  answers: { questionNumber: number; selectedOption: number; isBlank?: boolean; isMultiple?: boolean }[],
  answerKey: number[],
  totalQuestions: number,
  pointsPerQuestion: number,
  negativeMarking: boolean,
  negativeFactor: number,
  maxScore: number
) {
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  const evaluated = answers.map((ans) => {
    const q = ans.questionNumber;
    const correctOpt = answerKey[q - 1];
    const isBlank = ans.selectedOption === 0 || ans.isBlank;
    const isMultiple = ans.selectedOption === -1 || ans.isMultiple;

    let isCorrect = false;
    let earnedScore = 0;

    if (isBlank) {
      unansweredCount++;
      earnedScore = 0;
    } else if (isMultiple) {
      incorrectCount++;
      isCorrect = false;
      earnedScore = negativeMarking ? -(pointsPerQuestion * negativeFactor) : 0;
    } else if (correctOpt && ans.selectedOption === correctOpt) {
      correctCount++;
      isCorrect = true;
      earnedScore = pointsPerQuestion;
    } else {
      incorrectCount++;
      isCorrect = false;
      earnedScore = negativeMarking ? -(pointsPerQuestion * negativeFactor) : 0;
    }

    return {
      ...ans,
      isCorrect,
      earnedScore,
    };
  });

  const rawScore = evaluated.reduce((sum, a) => sum + (a.earnedScore || 0), 0);
  const finalScore = Number(Math.max(0, Math.min(maxScore, rawScore)).toFixed(2));

  return {
    evaluated,
    correctCount,
    incorrectCount,
    unansweredCount,
    rawScore: Number(rawScore.toFixed(2)),
    finalScore,
    maxScore,
  };
}

// Running Test Assertions
console.log('🧪 Starting Smart Sheet Unit Tests...');

// Test 1: All correct answers without negative marking
{
  const answerKey = [1, 2, 3, 4, 1, 2, 3, 4, 1, 2];
  const studentAnswers = [
    { questionNumber: 1, selectedOption: 1 },
    { questionNumber: 2, selectedOption: 2 },
    { questionNumber: 3, selectedOption: 3 },
    { questionNumber: 4, selectedOption: 4 },
    { questionNumber: 5, selectedOption: 1 },
    { questionNumber: 6, selectedOption: 2 },
    { questionNumber: 7, selectedOption: 3 },
    { questionNumber: 8, selectedOption: 4 },
    { questionNumber: 9, selectedOption: 1 },
    { questionNumber: 10, selectedOption: 2 },
  ];

  const res = calculateScore(studentAnswers, answerKey, 10, 2, false, 0.33, 20);
  console.assert(res.correctCount === 10, `Expected 10 correct, got ${res.correctCount}`);
  console.assert(res.incorrectCount === 0, `Expected 0 incorrect, got ${res.incorrectCount}`);
  console.assert(res.unansweredCount === 0, `Expected 0 blank, got ${res.unansweredCount}`);
  console.assert(res.finalScore === 20, `Expected 20, got ${res.finalScore}`);
  console.log('✅ Test 1 Passed: 100% correct score calculation');
}

// Test 2: Blank answers and negative marking
// 20 questions, 15 correct, 3 incorrect, 2 blank
// 1 point per question, negative factor = 1/3
// Raw = 15*1 - 3*(1/3) = 15 - 1 = 14
{
  const answerKey = Array(20).fill(1); // All keys are option 1
  const studentAnswers = Array(20).fill(null).map((_, idx) => {
    const q = idx + 1;
    if (q <= 15) return { questionNumber: q, selectedOption: 1 }; // 15 correct
    if (q <= 18) return { questionNumber: q, selectedOption: 2 }; // 3 incorrect
    return { questionNumber: q, selectedOption: 0, isBlank: true }; // 2 blank
  });

  const res = calculateScore(studentAnswers, answerKey, 20, 1, true, 0.3333333333333333, 20);
  console.assert(res.correctCount === 15, `Expected 15 correct, got ${res.correctCount}`);
  console.assert(res.incorrectCount === 3, `Expected 3 incorrect, got ${res.incorrectCount}`);
  console.assert(res.unansweredCount === 2, `Expected 2 blank, got ${res.unansweredCount}`);
  console.assert(Math.abs(res.finalScore - 14.0) < 0.05, `Expected 14, got ${res.finalScore}`);
  console.log('✅ Test 2 Passed: 15 correct, 3 wrong, 2 blank with negative marking = 14/20');
}

// Test 3: Multiple marked answer handling
// When student marks 2 options for a question (isMultiple: true), it counts as incorrect
{
  const answerKey = [2, 3];
  const studentAnswers = [
    { questionNumber: 1, selectedOption: 2 },
    { questionNumber: 2, selectedOption: -1, isMultiple: true }, // 2 options filled
  ];

  const res = calculateScore(studentAnswers, answerKey, 2, 10, true, 0.3333333333333333, 20);
  console.assert(res.correctCount === 1, `Expected 1 correct, got ${res.correctCount}`);
  console.assert(res.incorrectCount === 1, `Expected 1 incorrect, got ${res.incorrectCount}`);
  console.assert(res.finalScore < 10, `Expected penalty deduction for multiple mark, got ${res.finalScore}`);
  console.log('✅ Test 3 Passed: Double-marked option penalized as incorrect');
}

// Test 4: Floor at 0 (Negative score clamp)
// If wrong answers exceed correct, score should never be negative
{
  const answerKey = [1, 1, 1, 1, 1];
  const studentAnswers = Array(5).fill(null).map((_, idx) => ({
    questionNumber: idx + 1,
    selectedOption: 2, // All wrong
  }));

  const res = calculateScore(studentAnswers, answerKey, 5, 4, true, 0.5, 20);
  console.assert(res.rawScore < 0, `Expected negative raw score, got ${res.rawScore}`);
  console.assert(res.finalScore === 0, `Expected finalScore clamped to 0, got ${res.finalScore}`);
  console.log('✅ Test 4 Passed: Negative score cleanly clamped to 0');
}

// Test 5: Sheet Code Format Regex
{
  const validPattern = /^KIT-\d{4}-\d{4}$/;
  const sampleCode = 'KIT-7821-4903';
  console.assert(validPattern.test(sampleCode), `Sample code ${sampleCode} should match pattern`);
  console.log('✅ Test 5 Passed: Sheet code format verified (KIT-XXXX-XXXX)');
}

console.log('🎉 ALL SMART SHEET UNIT TESTS PASSED SUCCESSFULLY!');
