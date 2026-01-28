# User Management System - Quick Start Guide

## 🎯 What's New

Your ticket management application now includes a comprehensive **User & Company Management System** with:

✅ **Company Profiles** - Create and manage company profiles with detailed information  
✅ **Enhanced User Management** - Associate users with companies, add departments and job titles  
✅ **Ticket Integration** - Link tickets to companies and assign to specific agents  
✅ **Advanced Analytics** - Company performance metrics and agent workload tracking  
✅ **Export Capabilities** - Export users and companies to CSV  
✅ **Role-Based Access** - Admin, Agent, and Customer roles with appropriate permissions  

## 🚀 Quick Setup (3 Steps)

### Step 1: Run Database Migration

Open your terminal in the project directory and run:

```bash
node migrate-user-management.js
```

This will automatically:
- Create the `companies` table
- Add new columns to `users` table (company_id, department, job_title, phone)
- Add new columns to `tickets` table (company_id, assigned_to)
- Create performance indexes
- Add sample company data (optional)

**Expected Output:**
```
🚀 Starting database migration for User Management System...

📋 Step 1: Creating companies table...
   ✅ Companies table created successfully

📋 Step 2: Updating users table...
   ✅ Added company_id column to users
   ✅ Added department column to users
   ✅ Added job_title column to users
   ✅ Added phone column to users
   ✅ Users table updated successfully

... and more

✨ Migration completed successfully!
```

### Step 2: Add CSS and JavaScript Files

Add these lines to your `index.html`:

**In the `<head>` section** (around line 5-10):
```html
<link rel="stylesheet" href="/assets/user-management.css">
```

**Before the closing `</body>` tag** (around line 4380):
```html
<script src="/assets/user-management.js"></script>
```

### Step 3: Update the User Management Section in HTML

Find the user management section in `index.html` (search for `id="user-management"` around line 1821) and replace it with the enhanced version that includes:

- Tab navigation (Users, Companies, Activity Log)
- Company management features
- Enhanced user forms with company selection
- Modal dialogs for creating/editing

**Note:** The complete HTML replacement is quite large. You can either:

**Option A:** Manually insert the enhanced HTML from the documentation  
**Option B:** Use the provided HTML snippet file (if you want me to create a separate file with just the HTML to copy-paste)

## 📁 Files Created

The following files have been created in your project:

### Backend Functions (Netlify Functions)
- `netlify/functions/companies-create.js` - Create new companies
- `netlify/functions/companies-list.js` - List all companies with statistics
- `netlify/functions/companies-update.js` - Update company information

### Frontend Assets
- `assets/user-management.js` - JavaScript functions for user/company management
- `assets/user-management.css` - Styles for modals, tables, and UI components

### Documentation & Migration
- `USER-MANAGEMENT-GUIDE.md` - Complete documentation
- `migrate-user-management.js` - Database migration script
- `netlify/functions/lib/user-management-schema.sql` - SQL schema reference

### Updated Files
- `netlify/functions/lib/auth.js` - Enhanced createUser function
- `netlify/functions/lib/database.js` - No changes (already compatible)
- `netlify/functions/create-user.js` - Support for company data
- `netlify/functions/update-user.js` - Support for company data
- `netlify/functions/list-users.js` - Returns company information
- `netlify/functions/get-analytics.js` - Includes company and agent analytics

## 🎨 Features Overview

### User Management Tab
- View all users in a sortable table
- Search by name, email, department, or job title
- Filter by role (Admin/Agent/Customer)
- Filter by company
- Filter by status (Active/Inactive)
- Create/Edit/Delete users
- Export users to CSV

### Companies Tab
- View companies in a card grid layout
- See user count and ticket count per company
- Company details: name, domain, phone, address, industry, size
- Create/Edit companies
- View company details
- Export companies to CSV

### Activity Log Tab
- Track user activities (coming soon)
- Filter by activity type
- Filter by date
- View detailed activity history

## 🔑 How to Use

### Creating Your First Company

1. Navigate to **User Management** (click 👥 User Management in sidebar)
2. Click the **Companies** tab
3. Click **🏢 Add New Company**
4. Fill in the details:
   - **Company Name** (required)
   - **Domain** (e.g., acme.com)
   - **Phone**
   - **Address**
   - **Industry** (Technology, Healthcare, Finance, etc.)
   - **Company Size** (Small, Medium, Large, Enterprise)
   - **Notes**
5. Click **Save Company**

### Creating a User and Assigning to Company

1. Go to **User Management** → **Users** tab
2. Click **👤 Add New User**
3. Fill in the details:
   - **Full Name** (required)
   - **Email** (required)
   - **Role** (Admin/Agent/Customer) (required)
   - **Company** (select from dropdown)
   - **Department** (e.g., Support, Sales)
   - **Job Title** (e.g., Support Engineer)
   - **Phone**
   - **Password** (required for new users)
4. Click **Save User**

### Assigning Tickets to Companies

Tickets can be associated with companies in two ways:

1. **Manual Assignment** - When creating/editing a ticket, select the company
2. **Automatic Assignment** - If the customer email domain matches a company domain

### Viewing Analytics

1. Navigate to **Analytics** page
2. View the new sections:
   - **Top Companies by Tickets** - See which companies generate the most tickets
   - **Agent Performance** - Track agent workload and resolution rates
3. Export analytics data for reporting

## 🔒 Permissions

### Admin Role
- ✅ Create/Edit/Delete users
- ✅ Create/Edit companies
- ✅ View all tickets
- ✅ Access analytics
- ✅ Export data

### Agent Role
- ✅ View all users
- ✅ View all tickets
- ✅ Update ticket status
- ✅ View analytics
- ❌ Cannot create/delete users or companies

### Customer Role
- ✅ View own profile
- ✅ View own tickets
- ✅ Create tickets
- ❌ Cannot access user management
- ❌ Cannot access analytics

## 🐛 Troubleshooting

### Migration Errors

**"SQLITE_ERROR: duplicate column name"**
- This means the column already exists - it's safe to ignore
- The migration script handles this automatically

**"Cannot find module"**
- Ensure you're in the correct directory
- Run `npm install` to install dependencies

### Users Not Showing Companies

1. Verify migration completed successfully
2. Check that companies exist in database
3. Ensure users have `company_id` set
4. Refresh the page

### Companies Not Appearing in Dropdown

1. Ensure companies are created and active
2. Check browser console for errors
3. Verify API endpoints are working: `/.netlify/functions/companies-list`

## 📊 Sample Data

The migration script creates 3 sample companies:
- **Acme Corporation** (Technology, Large)
- **Global Dynamics** (Finance, Enterprise)
- **Tech Innovations** (Technology, Medium)

You can delete these and create your own companies, or keep them for testing.

## 🎯 Next Steps

1. ✅ **Run the migration** - Complete Step 1
2. ✅ **Add CSS/JS files** - Complete Step 2
3. ✅ **Update HTML** - Complete Step 3
4. 🎨 **Create your companies** - Add your actual companies
5. 👥 **Invite users** - Create user accounts
6. 🎫 **Associate tickets** - Link existing tickets to companies
7. 📊 **View analytics** - Check the new company metrics

## 💡 Pro Tips

- **Use consistent naming** - Name companies consistently for better organization
- **Fill in company domains** - This enables automatic ticket association
- **Assign departments** - Helps with routing and reporting
- **Use job titles** - Makes it easier to identify user roles
- **Export regularly** - Back up your user and company data
- **Monitor analytics** - Track company performance over time

## 📖 Full Documentation

For complete documentation, see:
- `USER-MANAGEMENT-GUIDE.md` - Comprehensive guide
- API endpoint documentation in the guide
- Database schema reference

## 🆘 Need Help?

If you encounter any issues:

1. Check the browser console for errors (F12)
2. Check the terminal/server logs
3. Verify all migration steps completed
4. Review the full documentation
5. Check that all API endpoints are accessible

## 🎉 You're All Set!

Your user management system is now ready to use. Navigate to the **User Management** page in your application to get started!

---

**Version:** 1.0.0  
**Last Updated:** January 11, 2026  
**Compatibility:** TicketMail v1.x
