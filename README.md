# Question CMS - Backend

بک‌اند پنل مدیریت سوالات با Node.js، Express و MongoDB

## 🚀 نصب و راه‌اندازی

```bash
# نصب پکیج‌ها
yarn install

# کپی فایل env
cp .env.example .env

# ایجاد داده‌های تستی
yarn seed

# اجرای سرور در حالت توسعه
yarn dev
	
---

## فایل ۳۰: `backend/.env.example`

```bash
cat > backend/.env.example << 'EOF'
# سرور
PORT=5000
NODE_ENV=development

# دیتابیس
MONGODB_URI=mongodb://localhost:27017/question-cms

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# ادمین
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@123456

# کلاینت (آدرس فرانت‌اند)
CLIENT_URL=http://localhost:5173
