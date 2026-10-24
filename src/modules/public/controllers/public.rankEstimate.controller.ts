import { Request, Response } from 'express';
import https from 'https';

// In-memory cookie and CSRF jar for Biomaze
const biomazeCookies: Record<string, string> = {};
let csrfFetchedAt = 0;
const CSRF_TTL_MS = 15 * 60 * 1000; // 15 minutes

function parseSetCookie(setCookieHeaders: string[] | undefined) {
  if (!setCookieHeaders) return;
  for (const str of setCookieHeaders) {
    const parts = str.split(';')[0].split('=');
    const name = parts[0]?.trim();
    const val = parts.slice(1).join('=').trim();
    if (name) {
      biomazeCookies[name] = val;
    }
  }
}

function getCookieHeader(): string {
  return Object.entries(biomazeCookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function biomazeRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
  redirectCount = 0
): Promise<{ status: number; headers: Record<string, any>; body: string }> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) {
      return reject(new Error('Redirect count exceeded'));
    }

    const u = new URL(url);
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://biomaze.ir',
      'Referer': 'https://biomaze.ir/rank-estimate',
      'Accept': 'application/json, text/plain, */*',
      'Cookie': getCookieHeader(),
      ...(options.headers || {}),
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(options.body).toString();
    }

    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        parseSetCookie(res.headers['set-cookie']);

        // Follow redirects and forward cookies
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let loc = res.headers.location;
          if (!loc.startsWith('http')) {
            loc = `https://${u.hostname}${loc}`;
          }
          return resolve(biomazeRequest(loc, options, redirectCount + 1));
        }

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode || 200, headers: res.headers, body: data });
        });
      }
    );

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function ensureCsrfToken(): Promise<string> {
  const now = Date.now();
  if (biomazeCookies['XSRF-TOKEN'] && now - csrfFetchedAt < CSRF_TTL_MS) {
    return decodeURIComponent(biomazeCookies['XSRF-TOKEN']);
  }

  // Request CSRF cookie
  await biomazeRequest('https://biomaze.ir/sanctum/csrf-cookie');
  csrfFetchedAt = Date.now();

  return decodeURIComponent(biomazeCookies['XSRF-TOKEN'] || '');
}

/**
 * GET /api/public/rank-estimate/fields
 */
export async function getRankEstimateFields(_req: Request, res: Response) {
  try {
    const response = await biomazeRequest('https://biomaze.ir/api/guest/rank_estimate/fields');
    const data = JSON.parse(response.body);
    return res.json(data);
  } catch (error: any) {
    return res.json({
      data: [
        { id: '9c2a9659-5a7d-441a-8518-7d2e50a88928', title: 'تجربی' },
        { id: 'cc50d592-5821-4158-b08f-00a5c6054eb9', title: 'ریاضی' },
        { id: 'e6f48e03-e78c-4719-9438-1196e0cd566e', title: 'انسانی' },
      ],
    });
  }
}

/**
 * GET /api/public/rank-estimate/regions
 */
export async function getRankEstimateRegions(_req: Request, res: Response) {
  try {
    const response = await biomazeRequest('https://biomaze.ir/api/guest/rank_estimate/regions');
    const data = JSON.parse(response.body);
    return res.json(data);
  } catch (error: any) {
    return res.json({
      data: [
        { value: 'first_region', trans: 'منطقه ۱' },
        { value: 'second_region', trans: 'منطقه ۲' },
        { value: 'third_region', trans: 'منطقه ۳' },
      ],
    });
  }
}

/**
 * GET /api/public/rank-estimate/fields/:fieldId/entrance-exams
 */
export async function getFieldEntranceExams(req: Request, res: Response) {
  try {
    const { fieldId } = req.params;
    const response = await biomazeRequest(
      `https://biomaze.ir/api/guest/rank_estimate/fields/${fieldId}/entrance_exams`
    );
    const data = JSON.parse(response.body);
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ message: 'خطا در دریافت لیست سال‌های کنکور', error: error.message });
  }
}

/**
 * GET /api/public/rank-estimate/entrance-exams/:examId/grade-lessons
 */
export async function getExamGradeLessons(req: Request, res: Response) {
  try {
    const { examId } = req.params;
    const response = await biomazeRequest(
      `https://biomaze.ir/api/guest/rank_estimate/entrance_exams/${examId}/grade_lessons`
    );
    const data = JSON.parse(response.body);
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ message: 'خطا در دریافت لیست دروس', error: error.message });
  }
}

/**
 * POST /api/public/rank-estimate/result
 */
export async function calculateRankEstimate(req: Request, res: Response) {
  try {
    const { region, field_id, entrance_exam_id, lesson_percents, grade_scores } = req.body;
    console.log('📥 [Backend RankEstimate] Received Request Body:', JSON.stringify(req.body, null, 2));

    if (!region || !field_id || !entrance_exam_id) {
      console.log('⚠️ [Backend RankEstimate] Missing required base params');
      return res.status(400).json({ message: 'اطلاعات رشته، سهمیه یا سال کنکور ناقص است.' });
    }

    if (!Array.isArray(lesson_percents) || lesson_percents.length === 0) {
      console.log('⚠️ [Backend RankEstimate] Missing lesson_percents');
      return res.status(400).json({ message: 'درصدهای دروس وارد نشده است.' });
    }

    // Ensure valid CSRF token & cookies
    let xsrfToken = await ensureCsrfToken();

    const doRequest = async (token: string) => {
      const payloadString = JSON.stringify({
        region,
        field_id,
        entrance_exam_id,
        lesson_percents,
        grade_scores,
      });

      return biomazeRequest('https://biomaze.ir/api/guest/rank_estimate/result', {
        method: 'POST',
        headers: {
          'X-XSRF-TOKEN': token,
        },
        body: payloadString,
      });
    };

    let postRes = await doRequest(xsrfToken);

    // If 419 CSRF mismatch, refresh token once and retry
    if (postRes.status === 419) {
      console.log('🔄 [Backend RankEstimate] Got 419 CSRF mismatch, refreshing token...');
      csrfFetchedAt = 0; // force refresh
      xsrfToken = await ensureCsrfToken();
      postRes = await doRequest(xsrfToken);
    }

    console.log('📤 [Backend RankEstimate] Biomaze response status:', postRes.status);
    console.log('📤 [Backend RankEstimate] Biomaze response body:', postRes.body);

    const resData = JSON.parse(postRes.body);

    if (postRes.status >= 400) {
      return res.status(postRes.status).json(resData);
    }

    return res.json(resData);
  } catch (error: any) {
    console.error('❌ [Backend RankEstimate] Error calculating rank estimate:', error);
    return res.status(500).json({
      message: 'ارتباط با سرور تخمین رتبه برقرار نشد. لطفاً دوباره تلاش کنید.',
      error: error.message,
    });
  }
}
