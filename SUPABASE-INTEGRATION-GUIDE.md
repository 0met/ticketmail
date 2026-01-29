# TicketMail Supabase Integration Guide

## 🎯 Overview

Your TicketMail application has been successfully configured to use Supabase instead of NeonDB. This provides you with a complete backend-as-a-service solution with authentication, database, and real-time capabilities.

## ✅ What's Been Done

- ✅ Supabase JavaScript client installed
- ✅ Environment variables configured
- ✅ Database adapter updated for Supabase
- ✅ Authentication functions updated
- ✅ Connection tested successfully

## 🚀 Next Steps

### 1. Create Database Tables

Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/wzqekrqmmmpfnvnkrphk) and:

1. Click **SQL Editor** in the left sidebar
2. Copy and paste the SQL from `setup-supabase.js` output
3. Click **Run** to create all tables

### 2. Create Admin User

After creating the tables, run:

```bash
node create-supabase-admin.js
```

This creates an admin user:
- **Email**: admin@ticketmail.com
- **Password**: Admin123!
- ⚠️ **Change this password after first login!**

### 3. Test the Integration

```bash
node test-supabase.js
```

## 🔧 Configuration

Your `.env` file now contains:

```env
DATABASE_URL=postgresql://postgres:123456789dbWOKDJHIJ!@db.wzqekrqmmmpfnvnkrphk.supabase.co:5432/postgres
SUPABASE_URL=https://wzqekrqmmmpfnvnkrphk.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 🗂️ Database Schema

The following tables are created:

- **`users`** - User accounts with authentication
- **`sessions`** - Login sessions and tokens
- **`permissions`** - Role-based access control
- **`activity_log`** - User action tracking

## 🔐 Environment Switching

Your app automatically uses:
- **Supabase** when `NODE_ENV=production` or `USE_SUPABASE=true`
- **Local SQLite** for development (default)

## 🧪 Testing

Test your authentication endpoints:

```bash
# Test login
curl -X POST http://localhost:8888/.netlify/functions/auth-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ticketmail.com","password":"Admin123!"}'
```

## 📚 Additional Supabase Features

With Supabase, you now have access to:

- **Real-time subscriptions** for live updates
- **Built-in authentication** UI components
- **File storage** for attachments
- **Edge functions** (similar to Netlify functions)
- **Database webhooks** for automation

## 🆘 Troubleshooting

### Connection Issues
- Verify your API keys in Supabase dashboard
- Check your `.env` file has correct values
- Run `node test-supabase.js` to diagnose

### Table Creation Errors
- Ensure you're in the correct Supabase project
- Check SQL syntax in the SQL Editor
- Verify you have proper permissions

### Authentication Issues
- Confirm tables were created successfully
- Check admin user was created
- Verify password hashing is working

## 🎉 You're All Set!

Your TicketMail app is now fully integrated with Supabase. The authentication, user management, and database operations will work seamlessly with your existing Netlify functions.