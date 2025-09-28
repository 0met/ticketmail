const { neon } = require('@neondatabase/serverless');

async function setupDatabase() {
  try {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL environment variable not found');
      console.log('Please set your Neon database connection string in the DATABASE_URL environment variable');
      return;
    }

    console.log('🔗 Connecting to database...');
    const sql = neon(process.env.DATABASE_URL);
    
    console.log('🏗️ Creating user management tables...');
    
    // 1. Create users table
    console.log('Creating users table...');
    await sql`
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
      )
    `;
    console.log('✅ Users table created');

    // 2. Create sessions table
    console.log('Creating sessions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address INET,
        user_agent TEXT
      )
    `;
    console.log('✅ Sessions table created');

    // 3. Create permissions table
    console.log('Creating permissions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        permission_type VARCHAR(100) NOT NULL,
        resource_id VARCHAR(100),
        granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        granted_by INTEGER REFERENCES users(id)
      )
    `;
    console.log('✅ Permissions table created');

    // 4. Create activity log table
    console.log('Creating activity_log table...');
    await sql`
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
      )
    `;
    console.log('✅ Activity log table created');

    // 5. Create indexes for better performance (run separately to avoid transaction issues)
    console.log('Creating database indexes...');
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at)`;
      console.log('✅ Database indexes created');
    } catch (indexError) {
      console.log('⚠️  Some indexes may already exist (this is normal)');
    }

    // 6. Check if admin user exists
    console.log('Checking for existing admin user...');
    const existingAdmin = await sql`
      SELECT id, email, role FROM users WHERE role = 'admin' LIMIT 1
    `;

    if (existingAdmin.length === 0) {
      console.log('Creating default admin user...');
      const bcrypt = require('bcryptjs');
      const adminEmail = 'admin@ticketmail.com';
      const adminPassword = 'admin123456';
      const hashedPassword = await bcrypt.hash(adminPassword, 12);

      const newAdmin = await sql`
        INSERT INTO users (email, password_hash, full_name, role, is_active)
        VALUES (${adminEmail}, ${hashedPassword}, 'System Administrator', 'admin', true)
        RETURNING id, email
      `;

      if (newAdmin.length > 0) {
        const adminId = newAdmin[0].id;
        
        // Add admin permissions
        await sql`
          INSERT INTO permissions (user_id, permission_type, granted_at)
          VALUES 
            (${adminId}, 'admin_access', CURRENT_TIMESTAMP),
            (${adminId}, 'user_management', CURRENT_TIMESTAMP),
            (${adminId}, 'system_settings', CURRENT_TIMESTAMP),
            (${adminId}, 'ticket_management', CURRENT_TIMESTAMP)
        `;
        
        // Log the admin creation
        await sql`
          INSERT INTO activity_log (user_id, action, resource_type, details)
          VALUES (${adminId}, 'admin_created', 'user', '{"method": "manual_setup", "created_by": "setup_script"}')
        `;
        
        console.log('✅ Admin user created successfully!');
        console.log('📧 Email: admin@ticketmail.com');
        console.log('🔐 Password: admin123456');
        console.log('⚠️  Please change this password after first login!');
      }
    } else {
      console.log('✅ Admin user already exists:', existingAdmin[0].email);
    }

    // 7. Verify setup
    console.log('🔍 Verifying database setup...');
    const tableCheck = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'sessions', 'permissions', 'activity_log')
      ORDER BY table_name
    `;
    
    console.log('📊 Created tables:', tableCheck.map(t => t.table_name).join(', '));
    
    const userCount = await sql`SELECT COUNT(*) as count FROM users`;
    console.log('👥 Total users:', userCount[0].count);
    
    console.log('');
    console.log('🎉 Database setup completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Visit your TicketMail application');
    console.log('2. Click "Sign In" and use the admin credentials above');
    console.log('3. Change the default password for security');
    console.log('4. Start managing your tickets with full authentication!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.error('Full error:', error);
    
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      console.log('');
      console.log('💡 This error suggests the tables need to be created.');
      console.log('Make sure your DATABASE_URL is correct and the database is accessible.');
    }
    
    if (error.message.includes('connect') || error.message.includes('timeout')) {
      console.log('');
      console.log('💡 Connection error - please check:');
      console.log('- Your Neon database is running');
      console.log('- DATABASE_URL environment variable is correct');
      console.log('- Your internet connection is stable');
    }
  }
}

// Run the setup
console.log('🚀 Starting TicketMail Database Setup...');
console.log('');
setupDatabase();