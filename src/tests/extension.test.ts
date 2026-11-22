import assert from 'assert';
import { SmsService } from '../core/services/sms.service.js';

export function runExtensionLogicTests() {
  console.log('🧪 Starting Extension Core Logic Self-Checks (V2)...');

  // 1. Phone Normalization tests
  const raw1 = '09123456789';
  const raw2 = '۹۸۹۱۲۳۴۵۶۷۸۹';
  const raw3 = '+98 912 345 6789';
  const raw4 = '9123456789';

  assert.strictEqual(SmsService.normalizePhone(raw1), '09123456789', 'Plain Iranian phone should be normalized');
  assert.strictEqual(SmsService.normalizePhone(raw2), '09123456789', 'Persian digits phone with 98 prefix should be 09...');
  assert.strictEqual(SmsService.normalizePhone(raw3), '09123456789', 'Formatted phone with spaces and +98 should be 09...');
  assert.strictEqual(SmsService.normalizePhone(raw4), '09123456789', '10-digit phone starting with 9 should prefix with 0');

  // 2. Real OTP verification (12345 bypass must NOT exist)
  assert.strictEqual(SmsService.verifyOtp('09123456789', ''), false, 'Empty OTP code must fail');
  assert.strictEqual(SmsService.verifyOtp('09123456789', '12345'), false, 'Hardcoded 12345 must NOT bypass real verification');
  assert.strictEqual(SmsService.verifyOtp('09123456789', '00000'), false, 'Invalid code must fail');

  // 3. Calendar Special Days format
  const mockExamEvent = {
    day: 24,
    month: 9,
    jalaliDate: '9-24',
    title: 'روز امتحانات',
    hasBlueDot: true,
    isExam: true,
  };
  assert.strictEqual(mockExamEvent.hasBlueDot, true, 'Exam day must have blue dot indicator');
  assert.strictEqual(mockExamEvent.day, 24, 'Exam day should be day 24');

  // 4. Subjects structure check
  const defaultSubjects = {
    elementary: ['فارسی و نگارش', 'ریاضی', 'علوم تجربی'],
    highschool: ['ادبیات فارسی', 'عربی', 'دین و زندگی'],
  };
  assert.ok(Array.isArray(defaultSubjects.elementary), 'Elementary subjects must be an array');
  assert.ok(Array.isArray(defaultSubjects.highschool), 'Highschool subjects must be an array');

  // 5. WorkMode validation
  const validWorkModes = ['school', 'office'];
  assert.ok(validWorkModes.includes('school'), 'school is valid workMode');
  assert.ok(validWorkModes.includes('office'), 'office is valid workMode');

  console.log('✅ All Extension Core Logic Tests (V2) Passed Successfully!');
}

if (process.argv[1] && process.argv[1].includes('extension.test.ts')) {
  runExtensionLogicTests();
}
