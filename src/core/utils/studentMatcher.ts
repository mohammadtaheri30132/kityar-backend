/**
 * ابزار کمکی تطبیق و مقایسه هوشمند نام و نام خانوادگی دانش‌آموزان
 */

/**
 * نرمال‌سازی رشته فارسی (حذف نیم‌فاصله، استانداردسازی ی و ک، حذف اعراب)
 */
export function normalizePersian(text: string = ''): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/[\u200c\u200b\u200e\u200f]/g, '') // حذف نیم‌فاصله‌ها و کاراکترهای نامرئی
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[ة]/g, 'ه')
    .replace(/[آأإ]/g, 'ا')
    .replace(/[\u064B-\u065F]/g, '') // حذف اعراب (حرکات تشدید، تنوین و...)
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * محاسبه فاصله ویرایشی لون‌اشتاین بین دو رشته
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= bn; ++i) matrix[i] = [i];
  for (let i = 0; i <= an; ++i) matrix[0][i] = i;

  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // جانشانی
          Math.min(
            matrix[i][j - 1] + 1,     // درج
            matrix[i - 1][j] + 1      // حذف
          )
        );
      }
    }
  }
  return matrix[bn][an];
}

export interface SimilarityResult {
  isMatch: boolean;
  score: number; // بین 0 تا 1 (درصد شباهت)
  percent: number; // عدد صحیح بین 0 تا 100
  reason: string;
}

/**
 * بررسی شباهت نام و نام خانوادگی:
 * اگر شامل باشد یا درصد شباهت کاراکتری حداقل ۷۰ درصد باشد، تطبیق داده می‌شود.
 */
export function checkStudentNameSimilarity(nameA: string, nameB: string): SimilarityResult {
  const normA = normalizePersian(nameA);
  const normB = normalizePersian(nameB);

  if (!normA || !normB) {
    return { isMatch: false, score: 0, percent: 0, reason: '' };
  }

  // ۱. یکسان بودن کامل
  if (normA === normB) {
    return {
      isMatch: true,
      score: 1.0,
      percent: 100,
      reason: 'یکسان بودن کامل نام و نام خانوادگی',
    };
  }

  // ۲. شامل بودن (یکی شامل دیگری باشد بدون فاصله)
  const compactA = normA.replace(/\s+/g, '');
  const compactB = normB.replace(/\s+/g, '');

  if (compactA.includes(compactB) || compactB.includes(compactA)) {
    return {
      isMatch: true,
      score: 0.95,
      percent: 95,
      reason: 'شامل بودن نام یا وجود پسوند/پیشوند مشترک',
    };
  }

  // ۳. شباهت کاراکتری با الگوریتم Levenshtein
  const maxLen = Math.max(compactA.length, compactB.length);
  const dist = levenshteinDistance(compactA, compactB);
  const similarity = 1 - (dist / maxLen);
  const percent = Math.round(similarity * 100);

  // بررسی شرط ۷۰ درصد شباهت کاراکتری
  if (similarity >= 0.70) {
    return {
      isMatch: true,
      score: Math.round(similarity * 100) / 100,
      percent,
      reason: `شباهت کاراکتری بالاتر از ۷۰ درصد (${percent}٪)`,
    };
  }

  return {
    isMatch: false,
    score: Math.round(similarity * 100) / 100,
    percent,
    reason: '',
  };
}
