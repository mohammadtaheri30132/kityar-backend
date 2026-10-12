import { FormType } from '../core/models/Form.js';

export interface FormTemplateData {
  id: string;
  title: string;
  description: string;
  category: string;
  formType: FormType;
  theme: {
    primaryColor: string;
    backgroundColor: string;
    mode: 'conversational' | 'traditional';
    welcomeTitle: string;
    welcomeDescription: string;
    completionTitle: string;
    completionMessage: string;
    showProgressBar: boolean;
  };
  settings: {
    isQuiz: boolean;
    passingScore?: number;
    showScoreToRespondent: boolean;
    limitOnePerDevice: boolean;
    limitOnePerAccount: boolean;
    accessType: 'public' | 'authenticated' | 'class_members';
    allowPartialSave: boolean;
    allowMultipleSubmissions: boolean;
  };
  questions: any[];
}

export const FORM_TEMPLATES: FormTemplateData[] = [
  {
    id: 'student-satisfaction',
    title: 'نظرسنجی رضایت دانش‌آموزان از تدریس',
    description: 'دریافت بازخورد صادقانه و مستمر دانش‌آموزان برای ارتقای کیفیت کلاس و روش تدریس',
    category: 'نظرسنجی دانش‌آموزی',
    formType: 'student_survey',
    theme: {
      primaryColor: '#3B82F6',
      backgroundColor: '#F8FAFC',
      mode: 'conversational',
      welcomeTitle: 'خوش آمدید به نظرسنجی کلاس',
      welcomeDescription: 'نظرات شما به ما کمک می‌کند تا کلاس پربارتر و جذاب‌تری داشته باشیم. پاسخ‌ها کاملاً محرمانه هستند.',
      completionTitle: 'با تشکر فراوان!',
      completionMessage: 'بازخورد شما با موفقیت ثبت شد. نظر شما برای ما بسیار ارزشمند است.',
      showProgressBar: true,
    },
    settings: {
      isQuiz: false,
      showScoreToRespondent: false,
      limitOnePerDevice: true,
      limitOnePerAccount: false,
      accessType: 'public',
      allowPartialSave: true,
      allowMultipleSubmissions: false,
    },
    questions: [
      {
        id: 'q1',
        type: 'rating_stars',
        title: 'میزان تسلط و شیوه بیان درس توسط معلم را چگونه ارزیابی می‌کنید؟',
        description: 'از ۱ (ضعیف) تا ۵ (عالی)',
        required: true,
        order: 1,
        minValue: 1,
        maxValue: 5,
      },
      {
        id: 'q2',
        type: 'likert',
        title: 'سرعت تدریس مباحث در کلاس مناسب است.',
        required: true,
        order: 2,
        options: [
          { id: 'opt1', label: 'کاملاً موافقم' },
          { id: 'opt2', label: 'موافقم' },
          { id: 'opt3', label: 'نظری ندارم' },
          { id: 'opt4', label: 'مخالفم' },
          { id: 'opt5', label: 'کاملاً مخالفم' },
        ],
      },
      {
        id: 'q3',
        type: 'multiple_choice',
        title: 'کدام بخش‌های کلاس برای شما جذاب‌تر و مفیدتر است؟',
        description: 'می‌توانید چند گزینه انتخاب کنید',
        required: true,
        order: 3,
        options: [
          { id: 'opt1', label: 'حل تمرین‌های گروهی' },
          { id: 'opt2', label: 'ارائه اسلاید و فیلم‌های آموزشی' },
          { id: 'opt3', label: 'پرسش و پاسخ و رفع اشکال' },
          { id: 'opt4', label: 'آزمون‌ها و کوئیزهای کلاسی' },
        ],
        allowOther: true,
      },
      {
        id: 'q4',
        type: 'long_text',
        title: 'چه پیشنهاد یا انتقادی برای بهتر شدن روند کلاس دارید؟',
        description: 'هر نکته‌ای که به نظرتان می‌تواند کلاس را مفیدتر کند بنویسید.',
        required: false,
        order: 4,
      },
    ],
  },
  {
    id: 'quiz-assessment',
    title: 'کوییز و آزمون تشخیصی کلاسی',
    description: 'سنجش یادگیری و درک مفاهیم با قابلیت تصحیح خودکار و محاسبه نمره',
    category: 'آزمون و ارزیابی',
    formType: 'quiz',
    theme: {
      primaryColor: '#10B981',
      backgroundColor: '#F0FDF4',
      mode: 'conversational',
      welcomeTitle: 'آزمون سنجش پیشرفت تحصیلی',
      welcomeDescription: 'به سوالات با دقت پاسخ دهید. نمره شما بلافاصله پس از اتمام آزمون محاسبه می‌شود.',
      completionTitle: 'آزمون به پایان رسید',
      completionMessage: 'پاسخ‌های شما با موفقیت ثبت شد.',
      showProgressBar: true,
    },
    settings: {
      isQuiz: true,
      passingScore: 12,
      showScoreToRespondent: true,
      limitOnePerDevice: true,
      limitOnePerAccount: false,
      accessType: 'public',
      allowPartialSave: false,
      allowMultipleSubmissions: false,
    },
    questions: [
      {
        id: 'q1',
        type: 'short_text',
        title: 'نام و نام خانوادگی خود را وارد کنید',
        required: true,
        order: 1,
      },
      {
        id: 'q2',
        type: 'quiz_single',
        title: 'واحد اندازه‌گیری نیرو در سیستم بین‌المللی SI چیست؟',
        required: true,
        order: 2,
        points: 5,
        options: [
          { id: 'opt1', label: 'ژول (Joule)', isCorrect: false },
          { id: 'opt2', label: 'نیوتون (Newton)', isCorrect: true },
          { id: 'opt3', label: 'پاسکال (Pascal)', isCorrect: false },
          { id: 'opt4', label: 'وات (Watt)', isCorrect: false },
        ],
        explanation: 'واحد بین‌المللی اندازه‌گیری نیرو در SI نیوتون است که برابر با یک کیلوگرم در متر بر مجذور ثانیه می‌باشد.',
      },
      {
        id: 'q3',
        type: 'quiz_single',
        title: 'کدام سیاره به سیاره سرخ معروف است؟',
        required: true,
        order: 3,
        points: 5,
        options: [
          { id: 'opt1', label: 'زهره', isCorrect: false },
          { id: 'opt2', label: 'مریخ', isCorrect: true },
          { id: 'opt3', label: 'مشتری', isCorrect: false },
          { id: 'opt4', label: 'عطارد', isCorrect: false },
        ],
        explanation: 'مریخ به دلیل وجود مقادیر زیاد اکسید آهن بر سطح آن، رنگ سرخی دارد و به سیاره سرخ معروف است.',
      },
      {
        id: 'q4',
        type: 'quiz_short_answer',
        title: 'فرمول مساحت مثلث را بنویسید (به فارسی یا انگلیسی)',
        required: true,
        order: 4,
        points: 5,
        correctAnswerText: 'قاعده ضربدر ارتفاع تقسیم بر دو',
        explanation: 'مساحت مثلث برابر است با نصف حاصل‌ضرب قاعده در ارتفاع.',
      },
      {
        id: 'q5',
        type: 'true_false',
        title: 'صحیح یا غلط: نور سریع‌تر از صوت حرکت می‌کند.',
        required: true,
        order: 5,
        points: 5,
        options: [
          { id: 'opt1', label: 'صحیح', isCorrect: true },
          { id: 'opt2', label: 'غلط', isCorrect: false },
        ],
        explanation: 'سرعت نور حدود ۳۰۰ هزار کیلومتر بر ثانیه و سرعت صوت در هوا حدود ۳۴۰ متر بر ثانیه است.',
      },
    ],
  },
  {
    id: 'assignment-media-submission',
    title: 'تحویل تکلیف، پروژه‌های درسی و فایل‌های صوتی',
    description: 'دریافت تکالیف، دست‌نویس‌ها، فایل‌های PDF، تصاویر برگه و فایل‌های صوتی دانش‌آموزان',
    category: 'تکلیف و ارسال فایل',
    formType: 'assignment',
    theme: {
      primaryColor: '#8B5CF6',
      backgroundColor: '#FAF5FF',
      mode: 'traditional',
      welcomeTitle: 'سامانه تحویل تکالیف درسی',
      welcomeDescription: 'لطفا اطلاعات خود را وارد کرده و تصاویر یا فایل‌های مربوط به تکالیف خود را بارگذاری کنید.',
      completionTitle: 'تکلیف با موفقیت دریافت شد',
      completionMessage: 'فایل‌های شما ثبت شد و معلم پس از بررسی، بازخورد و نمره را ثبت خواهد کرد.',
      showProgressBar: true,
    },
    settings: {
      isQuiz: false,
      showScoreToRespondent: false,
      limitOnePerDevice: false,
      limitOnePerAccount: false,
      accessType: 'public',
      allowPartialSave: true,
      allowMultipleSubmissions: true,
    },
    questions: [
      {
        id: 'q1',
        type: 'short_text',
        title: 'نام و نام خانوادگی دانش‌آموز',
        required: true,
        order: 1,
      },
      {
        id: 'q2',
        type: 'single_choice',
        title: 'کلاس / مقطع تحصیلی',
        required: true,
        order: 2,
        options: [
          { id: 'c1', label: 'کلاس الف' },
          { id: 'c2', label: 'کلاس ب' },
          { id: 'c3', label: 'کلاس ج' },
        ],
      },
      {
        id: 'q3',
        type: 'image_upload',
        title: 'تصویر برگه یا دست‌نویس حل تمرین',
        description: 'تصویر خوانا و با کیفیت از دفترچه یا برگه تکالیف خود ارسال کنید (حداکثر ۵ تصویر)',
        required: true,
        order: 3,
        allowedMediaTypes: ['image'],
        maxFileSizeMb: 15,
        maxFilesCount: 5,
      },
      {
        id: 'q4',
        type: 'audio_record',
        title: 'ضبط فایل صوتی روخوانی یا توضیح تمرین',
        description: 'می‌توانید صدای خود را مستقیماً از طریق مرورگر ضبط کرده و ارسال نمایید.',
        required: false,
        order: 4,
        maxFileSizeMb: 20,
      },
      {
        id: 'q5',
        type: 'file_upload',
        title: 'فایل گزارش پروژه یا فایل PDF (اختیاری)',
        description: 'اگر پروژه‌ای با نرم‌افزارهای ورد یا پاورپوئینت آماده کرده‌اید اینجا بارگذاری کنید.',
        required: false,
        order: 5,
        allowedMediaTypes: ['pdf', 'document'],
        maxFileSizeMb: 25,
        maxFilesCount: 2,
      },
    ],
  },
  {
    id: 'classroom-attendance',
    title: 'حضور و غیاب و ثبت فعالیت کلاسی',
    description: 'ثبت حضور و غیاب سریع دانش‌آموزان در جلسات آنلاین یا رویدادهای مدرسه',
    category: 'حضور و غیاب',
    formType: 'attendance',
    theme: {
      primaryColor: '#0EA5E9',
      backgroundColor: '#F0F9FF',
      mode: 'traditional',
      welcomeTitle: 'فرم ثبت حضور در جلسه کلاسی',
      welcomeDescription: 'لطفا در ابتدای جلسه نام و وضعیت حضور خود را تایید نمایید.',
      completionTitle: 'حضور شما ثبت شد',
      completionMessage: 'ساعت و تاریخ ورود شما به جلسه با موفقیت ذخیره گردید.',
      showProgressBar: false,
    },
    settings: {
      isQuiz: false,
      showScoreToRespondent: false,
      limitOnePerDevice: true,
      limitOnePerAccount: false,
      accessType: 'public',
      allowPartialSave: false,
      allowMultipleSubmissions: false,
    },
    questions: [
      {
        id: 'q1',
        type: 'short_text',
        title: 'نام و نام خانوادگی',
        required: true,
        order: 1,
      },
      {
        id: 'q2',
        type: 'phone',
        title: 'شماره تماس یا کد دانش‌آموزی',
        required: true,
        order: 2,
      },
      {
        id: 'q3',
        type: 'single_choice',
        title: 'وضعیت حضور',
        required: true,
        order: 3,
        options: [
          { id: 'opt1', label: 'حاضر در جلسه' },
          { id: 'opt2', label: 'با تاخیر وارد شدم' },
        ],
      },
      {
        id: 'q4',
        type: 'short_text',
        title: 'علت تاخیر یا توضیحات ضروری (در صورت وجود)',
        required: false,
        order: 4,
      },
    ],
  },
  {
    id: 'parent-feedback',
    title: 'نظرسنجی و ارتباط با اولیای دانش‌آموزان',
    description: 'دریافت دیدگاه‌ها، پیشنهادات و دغدغه‌های خانواده‌ها در خصوص پیشرفت درسی و اخلاقی',
    category: 'ارتباط با اولیا',
    formType: 'feedback',
    theme: {
      primaryColor: '#F59E0B',
      backgroundColor: '#FFFBEB',
      mode: 'conversational',
      welcomeTitle: 'همکاری و همراهی با اولیای گرامی',
      welcomeDescription: 'دیدگاه شما در رشد آموزشی و پرورشی فرزندانتان موثرترین راهنما برای ماست.',
      completionTitle: 'سپاس از وقت ارزشمند شما',
      completionMessage: 'نظرات شما با دقت مطالعه شده و در جلسات شورای معلمان بررسی خواهد شد.',
      showProgressBar: true,
    },
    settings: {
      isQuiz: false,
      showScoreToRespondent: false,
      limitOnePerDevice: true,
      limitOnePerAccount: false,
      accessType: 'public',
      allowPartialSave: true,
      allowMultipleSubmissions: false,
    },
    questions: [
      {
        id: 'q1',
        type: 'short_text',
        title: 'نام دانش‌آموز و نسبت شما (پدر / مادر / سرپرست)',
        required: true,
        order: 1,
      },
      {
        id: 'q2',
        type: 'rating_number',
        title: 'میزان رضایت کلی شما از روند آموزش و تکالیف منزل در ماه جاری',
        description: 'امتیاز از ۱ تا ۱۰',
        required: true,
        order: 2,
        minValue: 1,
        maxValue: 10,
      },
      {
        id: 'q3',
        type: 'yes_no',
        title: 'آیا فرزند شما برای انجام تکالیف روزانه به کمک والدین نیاز دارد؟',
        required: true,
        order: 3,
      },
      {
        id: 'q4',
        type: 'long_text',
        title: 'مهم‌ترین پیشنهاد شما برای پیشرفت فرزندتان در دروس چیست؟',
        required: false,
        order: 4,
      },
    ],
  },
];
