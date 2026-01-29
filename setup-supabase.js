const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function setupSupabaseDatabase() {
  try {
    // Check if environment variables are available
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
      console.log('Please set these in your .env file');
      return;
    }

    console.log('🔗 Connecting to Supabase...');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    console.log('🏗️ Creating user management tables...');

    // Note: Supabase handles table creation through SQL Editor or migrations
    // For now, we'll check if tables exist and provide SQL commands

    console.log('📋 Supabase Table Creation SQL:');
    console.log(`
-- Run these commands in your Supabase SQL Editor:

-- 1. Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'customer',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  profile_data JSONB,
  company_id INTEGER,
  department VARCHAR(255),
  job_title VARCHAR(255),
  phone VARCHAR(255)
);

-- 2. Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- 3. Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  permission_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  granted_by INTEGER REFERENCES users(id)
);

-- 4. Create activity_log table
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

-- 6. Enable Row Level Security (optional but recommended)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
    `);

    // Test the connection
    console.log('🧪 Testing Supabase connection...');
    const { data, error } = await supabase.from('users').select('count').limit(1);

    if (error) {
      console.log('⚠️  Connection test failed (this is normal if tables don\'t exist yet)');
      console.log('Error:', error.message);
    } else {
      console.log('✅ Supabase connection successful!');
    }

    console.log('🎉 Supabase setup complete!');
    console.log('📝 Next steps:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Run the SQL commands shown above');
    console.log('4. Create your first admin user');

  } catch (error) {
    console.error('❌ Database setup failed:', error);
  }
}

setupSupabaseDatabase();