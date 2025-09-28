const { neon } = require('@neondatabase/serverless');

async function checkAndSetupDatabase() {
  try {
    console.log('🔍 Checking existing database structure...');
    
    const sql = neon(process.env.DATABASE_URL);
    
    // First, let's see what tables already exist
    const existingTables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    console.log('📊 Existing tables:', existingTables.map(t => t.table_name).join(', ') || 'None');
    
    // Check if users table exists and what columns it has
    try {
      const userColumns = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND table_schema = 'public'
        ORDER BY ordinal_position
      `;
      
      if (userColumns.length > 0) {
        console.log('👥 Users table columns:', userColumns.map(c => `${c.column_name} (${c.data_type})`).join(', '));
        
        // Check if this is the old users table or new one
        const hasEmail = userColumns.some(c => c.column_name === 'email');
        
        if (!hasEmail) {
          console.log('⚠️  Found users table without email column - this appears to be an old table structure');
          console.log('🔄 We need to either drop and recreate, or create the auth tables with different names');
          
          const proceed = await askUser('Do you want to drop the existing users table and recreate it? (y/n): ');
          if (proceed.toLowerCase() === 'y' || proceed.toLowerCase() === 'yes') {
            console.log('🗑️  Dropping old users table...');
            await sql`DROP TABLE IF EXISTS users CASCADE`;
            console.log('✅ Old table dropped');
          } else {
            console.log('❌ Cannot proceed without dropping the conflicting table');
            return;
          }
        } else {
          console.log('✅ Users table already has correct structure');
        }
      }
    } catch (error) {
      console.log('📝 No users table found, will create new one');
    }
    
    // Now create the tables
    console.log('🏗️  Creating authentication tables...');
    
    // Create users table
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

    // Create other tables
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
    
    console.log('✅ All authentication tables created');
    
    // Verify the tables now exist with correct structure
    const finalCheck = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND table_schema = 'public'
      ORDER BY ordinal_position
    `;
    
    console.log('🔍 Final verification - Users table columns:');
    finalCheck.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type}`);
    });
    
    // Now check for admin user
    console.log('👤 Creating admin user...');
    const existingAdmin = await sql`SELECT id, email FROM users WHERE role = 'admin' LIMIT 1`;

    if (existingAdmin.length === 0) {
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
        
        await sql`
          INSERT INTO permissions (user_id, permission_type, granted_at)
          VALUES 
            (${adminId}, 'admin_access', CURRENT_TIMESTAMP),
            (${adminId}, 'user_management', CURRENT_TIMESTAMP),
            (${adminId}, 'system_settings', CURRENT_TIMESTAMP),
            (${adminId}, 'ticket_management', CURRENT_TIMESTAMP)
        `;
        
        console.log('✅ Admin user created!');
        console.log('📧 Email: admin@ticketmail.com');
        console.log('🔐 Password: admin123456');
      }
    } else {
      console.log('✅ Admin user already exists');
    }
    
    console.log('');
    console.log('🎉 DATABASE SETUP COMPLETED! 🎉');
    console.log('');
    console.log('🚀 You can now visit https://ticketmail.netlify.app/ and login!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error('Full error:', error);
  }
}

function askUser(question) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.log('❌ Please set DATABASE_URL environment variable first');
  console.log('Example: $env:DATABASE_URL = "your_connection_string"');
} else {
  checkAndSetupDatabase();
}