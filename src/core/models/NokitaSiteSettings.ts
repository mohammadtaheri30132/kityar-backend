import mongoose, { Document, Schema } from 'mongoose';

export interface INokitaSiteSettings extends Document {
  key: string; // 'default'
  homeHero: {
    badgeText: string;
    title: string;
    subtitle: string;
    ctaPrimaryText: string;
    ctaPrimaryLink: string;
    ctaSecondaryText: string;
    ctaSecondaryLink: string;
  };
  appDownload: {
    title: string;
    description: string;
    version: string;
    directApkUrl: string;
    bazaarUrl: string;
    myketUrl: string;
    iosPwaUrl: string;
  };
  features: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    tag?: string;
  }>;
  faqList: Array<{
    id: string;
    question: string;
    answer: string;
    category?: string;
    order: number;
    isPublished: boolean;
  }>;
  pages: {
    about: {
      title: string;
      content: string;
    };
    contact: {
      title: string;
      phone: string;
      email: string;
      supportHours: string;
      address: string;
      telegram: string;
      instagram: string;
    };
    terms: {
      title: string;
      content: string;
    };
    privacy: {
      title: string;
      content: string;
    };
  };
  seo: {
    siteTitle: string;
    titleTemplate: string;
    metaDescription: string;
    keywords: string[];
    ogImage: string;
    robotsIndex: boolean;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const nokitaSiteSettingsSchema = new Schema<INokitaSiteSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    homeHero: {
      badgeText: { type: String, default: 'همراه هوشمند درس و مدرسه دانش‌آموزان' },
      title: { type: String, default: 'نوکیتا؛ پلتفرم جامع برنامه‌ریزی، آزمون و کلاس‌های درسی' },
      subtitle: {
        type: String,
        default:
          'با نوکیتا در کلاس‌های مدرسه عضو شو، تکالیف را تحویل بده، در آزمون‌های آنلاین شرکت کن و پیشرفت تحصیلی‌ات را روزانه دنبال کن.',
      },
      ctaPrimaryText: { type: String, default: 'ورود به پنل دانش‌آموزی' },
      ctaPrimaryLink: { type: String, default: '/login' },
      ctaSecondaryText: { type: String, default: 'دانلود اپلیکیشن نوکیتا' },
      ctaSecondaryLink: { type: String, default: '/download' },
    },
    appDownload: {
      title: { type: String, default: 'دانلود اپلیکیشن هوشمند نوکیتا' },
      description: {
        type: String,
        default:
          'نسخه موبایل نوکیتا را نصب کن تا اعلان تکالیف جدید، تاریخ آزمون‌ها و پیام‌های معلمان را بلافاصله دریافت کنی.',
      },
      version: { type: String, default: '۲.۴.۰' },
      directApkUrl: { type: String, default: 'https://kitayar.ir/download/nokita.apk' },
      bazaarUrl: { type: String, default: 'https://cafebazaar.ir/app/com.kitayar.nokita' },
      myketUrl: { type: String, default: 'https://myket.ir/app/com.kitayar.nokita' },
      iosPwaUrl: { type: String, default: 'https://nokita.kitayar.ir' },
    },
    features: {
      type: [
        {
          id: { type: String },
          title: { type: String },
          description: { type: String },
          icon: { type: String },
          tag: { type: String },
        },
      ],
      default: [
        {
          id: 'schedule',
          title: 'برنامه‌ریزی درسی و مدیریت زمان',
          description: 'برنامه درسی هفتگی، تقویم امتحانات و یادآور انجام تکالیف برای نظم بیشتر در درس‌ها.',
          icon: 'calendar',
          tag: 'نظم تحصیلی',
        },
        {
          id: 'classes',
          title: 'عضویت در کلاس‌های مدرسه',
          description: 'ورود آسان به کلاس‌های اختصاصی معلمان با لینک یا کد ۶ رقمی دعوت و ارتباط کلاسی.',
          icon: 'users',
          tag: 'کلاس هوشمند',
        },
        {
          id: 'exams',
          title: 'آزمون‌های آنلاین با تصحیح فوری',
          description: 'شرکت در ارزشیابی‌ها و کوییزهای کلاسی و دریافت فوری کارنامه، درصدها و نقاط قوت و ضعف.',
          icon: 'award',
          tag: 'سنجش دقیق',
        },
        {
          id: 'homeworks',
          title: 'تکالیف تعاملی و ارسال پاسخ',
          description: 'مشاهده صورت سوالات تکالیف، ارسال پاسخ به صورت متن، تصویر یا صوت و مشاهده بازخورد معلم.',
          icon: 'bookOpen',
          tag: 'یادگیری عمیق',
        },
      ],
    },
    faqList: {
      type: [
        {
          id: { type: String },
          question: { type: String },
          answer: { type: String },
          category: { type: String, default: 'عمومی' },
          order: { type: Number, default: 0 },
          isPublished: { type: Boolean, default: true },
        },
      ],
      default: [
        {
          id: 'faq-1',
          question: 'چگونه می‌توانم با شماره موبایلم در نوکیتا ثبت‌نام کنم؟',
          answer:
            'کافی است به صفحه ورود/ثبت‌نام بروید، شماره موبایل خود را وارد کرده و کد تایید پیامکی را ثبت نمایید. حتی اگر شماره شما قبلاً در کیتایار استفاده شده باشد، می‌توانید در نوکیتا حساب دانش‌آموزی مستقل داشته باشید.',
          category: 'حساب کاربری',
          order: 1,
          isPublished: true,
        },
        {
          id: 'faq-2',
          question: 'چگونه با لینک یا کد معلم در کلاس عضو شوم؟',
          answer:
            'روی لینک ارسالی توسط معلم کلیک کنید یا کد ۶ رقمی کلاس را در کادر صفحه اصلی یا بخش کلاس‌های من وارد کنید تا فوراً به کلاس اضافه شوید.',
          category: 'کلاس‌ها',
          order: 2,
          isPublished: true,
        },
        {
          id: 'faq-3',
          question: 'آیا بدون نصب اپلیکیشن می‌توانم از نوکیتا استفاده کنم؟',
          answer:
            'بله! تمام امکانات ثبت‌نام، عضویت در کلاس‌ها، مشاهده تکالیف و شرکت در آزمون‌ها از طریق وبسایت نوکیتا در دسترس است.',
          category: 'دسترسی',
          order: 3,
          isPublished: true,
        },
      ],
    },
    pages: {
      about: {
        title: { type: String, default: 'درباره سامانه دانش‌آموزی نوکیتا' },
        content: {
          type: String,
          default:
            'نوکیتا پلتفرم تخصصی هوشمند برای رشد و پیشرفت تحصیلی دانش‌آموزان است. هدف ما ایجاد پلی مدرن، امن و ساده بین معلم، دانش‌آموز و محتوای آموزشی است تا یادگیری لذت‌بخش‌تر و هدفمندتر شود.',
        },
      },
      contact: {
        title: { type: String, default: 'تماس با پشتیبانی نوکیتا' },
        phone: { type: String, default: '۰۲۱-۹۱۰۹۰۰۰۰' },
        email: { type: String, default: 'support@kitayar.ir' },
        supportHours: { type: String, default: 'شنبه تا چهارشنبه از ساعت ۸ الی ۱۷' },
        address: { type: String, default: 'تهران، پارک علم و فناوری' },
        telegram: { type: String, default: 'nokita_support' },
        instagram: { type: String, default: 'nokita_app' },
      },
      terms: {
        title: { type: String, default: 'قوانین و مقررات استفاده از نوکیتا' },
        content: {
          type: String,
          default:
            'استفاده از نوکیتا به منزله پذیرش مقررات آموزشی است. حفظ اطلاعات کاربری و شرکت متعهدانه در آزمون‌ها و تکالیف از وظایف دانش‌آموزان است.',
        },
      },
      privacy: {
        title: { type: String, default: 'حریم خصوصی دانش‌آموزان' },
        content: {
          type: String,
          default:
            'اطلاعات هویتی و تحصیلی دانش‌آموزان در نوکیتا کاملاً محرمانه بوده و تنها برای معلم همان کلاس و مدیریت آموزشی مدرسه قابل مشاهده است.',
        },
      },
    },
    seo: {
      siteTitle: { type: String, default: 'نوکیتا | سامانه هوشمند برنامه‌ریزی و مدیریت کلاس دانش‌آموزان' },
      titleTemplate: { type: String, default: '%s | نوکیتا' },
      metaDescription: {
        type: String,
        default:
          'نوکیتا، همراه هوشمند درس و مدرسه: شرکت در آزمون‌های آنلاین، تحویل تکالیف، عضویت در کلاس‌های دبیران و برنامه‌ریزی تحصیلی روزانه ویژه دانش‌آموزان ایران.',
      },
      keywords: {
        type: [String],
        default: [
          'نوکیتا',
          'سامانه دانش آموزی',
          'آزمون آنلاین دانش آموز',
          'تکالیف درسی',
          'برنامه ریزی تحصیلی',
          'عضویت در کلاس درس',
          'اپلیکیشن نوکیتا',
        ],
      },
      ogImage: { type: String, default: '/images/nokita_og.png' },
      robotsIndex: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export const NokitaSiteSettings =
  mongoose.models.NokitaSiteSettings ||
  mongoose.model<INokitaSiteSettings>('NokitaSiteSettings', nokitaSiteSettingsSchema);

