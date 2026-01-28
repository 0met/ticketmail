# User Management System Documentation

## Overview

This comprehensive user management system integrates users, companies, and tickets into a unified ecosystem. It allows you to:

- Create and manage user profiles with detailed information
- Organize users into company profiles
- Track tickets associated with companies and users
- View analytics and reporting data across the entire system
- Manage permissions and roles

## Features

### 1. User Management
- **Create Users**: Add new users with full details including name, email, role, company, department, job title, and phone
- **Edit Users**: Update user information and change their company association
- **Delete Users**: Remove users from the system (with confirmation)
- **User Roles**: Three role types - Admin, Agent, Customer
- **User Status**: Active/Inactive status for each user
- **Search & Filter**: Filter users by role, company, status, and search by name/email

### 2. Company Profiles
- **Company Management**: Create and manage company profiles
- **Company Details**: Store company name, domain, phone, address, industry, and size
- **Company Statistics**: View user count and ticket count for each company
- **Company Status**: Active/Inactive status for companies
- **User Association**: Link multiple users to each company

### 3. Ticket Integration
- **Company Tickets**: Track which tickets belong to which company
- **User Assignment**: Assign tickets to specific users (agents)
- **Ticket Analytics**: View ticket statistics by company
- **Customer Information**: Link ticket customer data to company profiles

### 4. Analytics & Reporting
- **User Statistics**: Total users, breakdown by role
- **Company Statistics**: Total companies, active companies, total users, total tickets
- **Activity Log**: Track user activities and changes (coming soon)
- **Export Data**: Export users and companies to CSV format

## Database Schema

### Companies Table
```sql
CREATE TABLE companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    domain VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    industry VARCHAR(100),
    company_size VARCHAR(50),
    notes TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Users Table (Enhanced)
New columns added:
- `company_id` - Foreign key to companies table
- `department` - User's department within the company
- `job_title` - User's job title
- `phone` - User's phone number

### Tickets Table (Enhanced)
New columns added:
- `company_id` - Foreign key to companies table
- `assigned_to` - Foreign key to users table (assigned agent)

## Installation & Setup

### Step 1: Run Database Migration

Run the migration script to update your database:

```bash
node migrate-user-management.js
```

This will:
- Create the companies table
- Add new columns to users and tickets tables
- Create necessary indexes for performance
- Optionally insert sample data

### Step 2: Update Your HTML

Add the CSS and JavaScript files to your `index.html`:

```html
<!-- In the <head> section -->
<link rel="stylesheet" href="/assets/user-management.css">

<!-- Before the closing </body> tag -->
<script src="/assets/user-management.js"></script>
```

### Step 3: Replace User Management Section

The new user management page includes:
- Tab navigation (Users, Companies, Activity Log)
- Enhanced user table with company information
- Company management grid
- Modal dialogs for creating/editing users and companies
- Advanced filtering and search capabilities

## API Endpoints

### User Management
- `GET /.netlify/functions/list-users` - Get all users with company data
- `POST /.netlify/functions/create-user` - Create new user
- `POST /.netlify/functions/update-user` - Update existing user
- `POST /.netlify/functions/delete-user` - Delete user

### Company Management
- `GET /.netlify/functions/companies-list` - Get all companies
- `POST /.netlify/functions/companies-create` - Create new company
- `PUT /.netlify/functions/companies-update` - Update company
- (Optional) `DELETE /.netlify/functions/companies-delete` - Delete company

## Usage Guide

### Creating a Company

1. Navigate to User Management page
2. Click on "Companies" tab
3. Click "Add New Company" button
4. Fill in company details:
   - Company Name (required)
   - Domain (optional)
   - Phone (optional)
   - Address (optional)
   - Industry (select from dropdown)
   - Company Size (select from dropdown)
   - Notes (optional)
5. Set Active status (checked by default)
6. Click "Save Company"

### Creating a User

1. Navigate to User Management page
2. Click on "Users" tab
3. Click "Add New User" button
4. Fill in user details:
   - Full Name (required)
   - Email (required)
   - Role (required - Admin/Agent/Customer)
   - Company (select from dropdown)
   - Department (optional)
   - Job Title (optional)
   - Phone (optional)
   - Password (required for new users)
5. Set Active status (checked by default)
6. Click "Save User"

### Editing Users/Companies

1. Find the user or company in the list
2. Click the "Edit" button
3. Modify the information
4. Click "Save" to update

### Filtering and Search

**Users Tab:**
- Search by name, email, department, or job title
- Filter by role (Admin/Agent/Customer)
- Filter by company
- Filter by status (Active/Inactive)

**Companies Tab:**
- View companies in a card layout
- See user count and ticket count for each company
- Click "View" to see company details

### Exporting Data

1. Navigate to the desired tab (Users or Companies)
2. Apply any filters you want
3. Click "Export" button
4. CSV file will be downloaded with filtered data

## Integration with Analytics

The user management system integrates with your analytics dashboard to provide:

- **User Activity Metrics**: Track user logins, actions, and ticket interactions
- **Company Performance**: View ticket resolution rates by company
- **Agent Workload**: See ticket assignments and performance by agent
- **Customer Engagement**: Track customer ticket submissions and response times

### Updating Analytics Functions

To include company data in analytics, update `get-analytics.js`:

```javascript
// Add company-based analytics
const ticketsByCompany = await sql`
    SELECT 
        c.name as company_name,
        COUNT(t.id) as ticket_count,
        COUNT(CASE WHEN t.status = 'closed' THEN 1 END) as closed_count
    FROM companies c
    LEFT JOIN tickets t ON t.company_id = c.id
    WHERE c.is_active = true
    GROUP BY c.id, c.name
    ORDER BY ticket_count DESC
    LIMIT 10
`;
```

## Permissions and Security

### Role-Based Access Control

- **Admin**: Full access to all features
  - Create/edit/delete users
  - Create/edit/delete companies
  - View all tickets and analytics
  - Access activity logs

- **Agent**: Limited management access
  - View all users
  - View assigned tickets
  - Update ticket status
  - View analytics

- **Customer**: Self-service access
  - View own profile
  - View own tickets
  - Create new tickets
  - Limited dashboard access

### Session Management

All API calls require authentication:
```javascript
headers: {
    'Authorization': `Bearer ${sessionToken}`
}
```

## Troubleshooting

### Migration Issues

**Error: "table already exists"**
- This is normal if running migration multiple times
- The script checks for existing tables and skips creation

**Error: "column already exists"**
- SQLite doesn't support IF NOT EXISTS for ALTER TABLE
- Check the migration output to see which columns were added

### Data Display Issues

**Users not showing company information**
- Ensure migration completed successfully
- Check that users have company_id set
- Verify companies exist in the database

**Companies showing 0 users/tickets**
- Users/tickets may not be associated with companies yet
- Update existing records to set company_id

### Performance Issues

**Slow loading with many users**
- Indexes should be created by migration
- Check that indexes exist: `PRAGMA index_list(users);`
- Consider pagination for large datasets

## Future Enhancements

Potential features for future development:

1. **Advanced Activity Log**: Detailed tracking of all user and company changes
2. **Bulk Operations**: Import/export users in bulk, bulk company assignment
3. **Company Hierarchies**: Parent/child company relationships
4. **Custom Fields**: Additional custom fields per company or user
5. **Team Management**: Create teams within companies
6. **SLA Management**: Track SLAs per company
7. **Company Dashboards**: Dedicated dashboard view per company
8. **Email Integration**: Auto-create companies from email domains
9. **Audit Trail**: Comprehensive audit trail for compliance
10. **API Rate Limiting**: Per-company API rate limits

## Support

For issues or questions:
- Check the console for detailed error messages
- Review the network tab to see API responses
- Verify database schema matches documentation
- Check that all migration steps completed successfully

## Changelog

### Version 1.0.0 (2026-01-11)
- Initial release
- Company profiles with full CRUD operations
- Enhanced user management with company association
- Ticket integration with companies and user assignment
- CSV export functionality
- Tab-based navigation
- Advanced filtering and search
- Responsive modal dialogs
- Database migration script
- Comprehensive documentation
