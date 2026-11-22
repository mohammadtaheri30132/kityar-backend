import assert from 'assert';
import { SmsService } from '../core/services/sms.service.js';

export async function runSmsLookupTests() {
  console.log('🧪 Starting Kavenegar Verify Lookup Tests...');

  // 1. Test token sanitization
  const teacherName = 'محمد علی رضایی';
  const sanitizedTeacher = SmsService.sanitizeSingleToken(teacherName, 'استاد');
  assert.strictEqual(sanitizedTeacher, 'محمد_علی_رضایی', 'Spaces should be replaced with underscores');
  assert.strictEqual(sanitizedTeacher.includes(' '), false, 'Token must not contain any spaces');

  const courseName = 'شیمی دهم تجربی';
  const sanitizedCourse = SmsService.sanitizeSingleToken(courseName, 'درس');
  assert.strictEqual(sanitizedCourse, 'شیمی_دهم_تجربی', 'Course spaces should be replaced with underscores');

  assert.strictEqual(SmsService.sanitizeSingleToken('', 'پیش‌فرض'), 'پیش‌فرض', 'Empty string should return fallback');
  assert.strictEqual(SmsService.sanitizeSingleToken(null, 'پیش‌فرض'), 'پیش‌فرض', 'Null should return fallback');

  // 2. Test invalid phone numbers fail gracefully without throwing
  const res1 = await SmsService.sendTeacherClassRequest({
    mobile: '12345',
    teacherName: 'استاد',
    courseName: 'ریاضی',
    startTime: new Date(),
    duration: 90,
  });
  assert.strictEqual(res1.success, false, 'Invalid phone number should return success: false');

  const res2 = await SmsService.sendStudentRequestAccepted({
    mobile: '0912',
    studentName: 'دانش‌آموز',
    classTime: new Date(),
  });
  assert.strictEqual(res2.success, false, 'Short phone number should return success: false');

  console.log('✅ All Kavenegar Verify Lookup Self-Checks Passed!');
}

if (process.argv[1]?.endsWith('smsLookup.test.ts')) {
  runSmsLookupTests().then(() => process.exit(0)).catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}
