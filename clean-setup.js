const { neon } = require('@neondatabase/serverless');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function cleanSetupDatabase() {
  try {
    console.log('🧹 TicketMail Authentication Database Setup');
    console.log('==========================================');
    console.log('');

    const sql = neon(process.env.DATABASE_URL);
    
    console.log('🔍 Analyzing current database structure...');
    
    // Check all tables
    const allTables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    console.log('📊 Current tables:', allTables.map(t => t.table_name).join(', '));
    
    // Check permissions table structure
    try {
      const permCols = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'permissions' AND table_schema = 'public'
      `;
      console.log('🔑 Permissions table columns:', permCols.map(c => c.column_name).join(', '));
    } catch (e) {
      console.log('🔑 No permissions table found');
    }
    
    console.log('');
    console.log('⚠️  This will clean up old authentication tables and create new ones.');
    console.log('⚠️  Your ticket data will NOT be affected.');
    console.log('');
    
    const confirm = await askQuestion('Continue with cleanup and setup? (y/n): ');
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('❌ Setup cancelled');
      rl.close();
      return;
    }
    
    console.log('');
    console.log('🗑️  Cleaning up old authentication tables...');
    
    // Drop old auth tables in correct order (respecting foreign keys)
    await sql`DROP TABLE IF EXISTS role_permissions CASCADE`;
    await sql`DROP TABLE IF EXISTS user_sessions CASCADE`;
    await sql`DROP TABLE IF EXISTS user_settings CASCADE`;
    await sql`DROP TABLE IF EXISTS permissions CASCADE`;
    await sql`DROP TABLE IF EXISTS sessions CASCADE`;
    await sql`DROP TABLE IF EXISTS activity_log CASCADE`;
    
    console.log('✅ Old authentication tables removed');
    
    console.log('🏗️  Creating new authentication system...');
    
    // Create users table (we already recreated this)
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
    console.log('✅ Users table ready');

    // Create sessions table
    await sql`
      CREATE TABLE sessions (
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

    // Create permissions table
    await sql`
      CREATE TABLE permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        permission_type VARCHAR(100) NOT NULL,
        resource_id VARCHAR(100),
        granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        granted_by INTEGER REFERENCES users(id)
      )
    `;
    console.log('✅ Permissions table created');

    // Create activity log table
    await sql`
      CREATE TABLE activity_log (
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
    
    // Create indexes
    await sql`CREATE INDEX idx_users_email ON users(email)`;
    await sql`CREATE INDEX idx_users_role ON users(role)`;
    await sql`CREATE INDEX idx_sessions_token ON sessions(session_token)`;
    await sql`CREATE INDEX idx_sessions_expires ON sessions(expires_at)`;
    await sql`CREATE INDEX idx_permissions_user ON permissions(user_id)`;
    await sql`CREATE INDEX idx_activity_user ON activity_log(user_id)`;
    console.log('✅ Database indexes created');
    
    // Create admin user
    console.log('👤 Creating admin user...');
    const bcrypt = require('bcryptjs');
    const adminEmail = 'admin@ticketmail.com';
    const adminPassword = 'admin123456';
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    const newAdmin = await sql`
      INSERT INTO users (email, password_hash, full_name, role, is_active)
      VALUES (${adminEmail}, ${hashedPassword}, 'System Administrator', 'admin', true)
      RETURNING id, email
    `;

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
      VALUES (${adminId}, 'admin_created', 'user', '{"method": "clean_setup", "version": "2.0"}')
    `;
    
    console.log('✅ Admin user created successfully!');
    
    // Final verification
    console.log('');
    console.log('🔍 Final verification...');
    const userCount = await sql`SELECT COUNT(*) as count FROM users`;
    const sessionCount = await sql`SELECT COUNT(*) as count FROM sessions`;
    const permCount = await sql`SELECT COUNT(*) as count FROM permissions`;
    
    console.log(`👥 Users: ${userCount[0].count}`);
    console.log(`🔑 Sessions: ${sessionCount[0].count}`);
    console.log(`🛡️  Permissions: ${permCount[0].count}`);
    
    console.log('');
    console.log('🎉 AUTHENTICATION SYSTEM SETUP COMPLETE! 🎉');
    console.log('');
    console.log('🔐 Admin Login Credentials:');
    console.log('   Email: admin@ticketmail.com');
    console.log('   Password: admin123456');
    console.log('');
    console.log('⚠️  IMPORTANT: Change this password after first login!');
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('1. Visit: https://ticketmail.netlify.app/');
    console.log('2. Click "Sign In"');
    console.log('3. Use the credentials above');
    console.log('4. Change the default password');
    console.log('5. Your authentication system is now ready!');
    console.log('');
    console.log('✅ Your existing ticket data is preserved and ready to use!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error('Details:', error);
  } finally {
    rl.close();
  }
}

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.log('❌ Please set DATABASE_URL environment variable first');
  console.log('Example: $env:DATABASE_URL = "your_connection_string"');
} else {
  cleanSetupDatabase();
}