# TicketMail Database Setup Guide

## 🎯 Current Issue
The setup is failing because the database tables haven't been created yet. The DATABASE_URL is working (we can connect), but the user management tables need to be created first.

## 🛠️ Manual Setup Steps

### Step 1: Get Your DATABASE_URL from Neon

1. Go to [Neon Console](https://console.neon.tech/)
2. Select your TicketMail project
3. Go to the **Connection Details** section
4. Copy the connection string (it looks like this):
   ```
   postgresql://username:password@host/database?sslmode=require
   ```

### Step 2: Set Environment Variable (Windows PowerShell)

```powershell
$env:DATABASE_URL = "your_connection_string_here"
```

### Step 3: Run Database Setup

```powershell
node manual-database-setup.js
```

## 🚀 Quick Setup Commands

Open PowerShell in your ticketmail folder and run:

```powershell
# Replace YOUR_CONNECTION_STRING with your actual Neon connection string
$env:DATABASE_URL = "YOUR_CONNECTION_STRING"

# Run the setup
node manual-database-setup.js
```

## 📋 What the Setup Creates

1. **users** table - Store user accounts with secure password hashes
2. **sessions** table - Manage login sessions and tokens  
3. **permissions** table - Role-based access control
4. **activity_log** table - Track user actions for security
5. **Database indexes** - Optimize performance
6. **Default admin user**:
   - Email: admin@ticketmail.com  
   - Password: admin123456

## 🔧 Alternative: Direct SQL Setup

If the Node.js script doesn't work, you can run this SQL directly in your Neon console:

```sql
-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'customer',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  profile_data JSONB
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  permission_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100),
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  granted_by INTEGER REFERENCES users(id)
);

-- Create activity log table
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

-- Insert admin user (you'll need to hash the password)
-- This is just the table structure - use the Node.js script for the actual user creation
```

## 🎉 After Setup

Once the database is set up:

1. Visit https://ticketmail.netlify.app/
2. Click "Sign In" 
3. Use credentials: admin@ticketmail.com / admin123456
4. Change the password immediately!

## 💡 Troubleshooting

- **Connection Error**: Double-check your DATABASE_URL from Neon
- **Permission Error**: Make sure your Neon database allows connections
- **Table Already Exists**: That's fine! The script handles existing tables
- **bcryptjs Error**: Run `npm install bcryptjs` first