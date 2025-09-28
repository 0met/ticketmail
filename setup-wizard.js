const readline = require('readline');
const { neon } = require('@neondatabase/serverless');

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

async function setupDatabaseInteractive() {
  console.log('🚀 TicketMail Database Setup Wizard');
  console.log('===================================');
  console.log('');

  // Check if DATABASE_URL is already set
  if (process.env.DATABASE_URL) {
    console.log('✅ DATABASE_URL found in environment variables');
    console.log('🔗 Using existing connection...');
    await runSetup(process.env.DATABASE_URL);
  } else {
    console.log('📋 To complete setup, you need your Neon database connection string.');
    console.log('');
    console.log('📍 How to get it:');
    console.log('1. Go to https://console.neon.tech/');
    console.log('2. Select your TicketMail project');
    console.log('3. Copy the connection string from Connection Details');
    console.log('');
    console.log('It should look like:');
    console.log('postgresql://username:password@host/database?sslmode=require');
    console.log('');

    const connectionString = await askQuestion('🔑 Enter your DATABASE_URL: ');
    
    if (!connectionString || !connectionString.startsWith('postgresql://')) {
      console.log('❌ Invalid connection string. Please make sure it starts with postgresql://');
      rl.close();
      return;
    }

    await runSetup(connectionString);
  }
  
  rl.close();
}

async function runSetup(databaseUrl) {
  try {
    console.log('');
    console.log('🏗️ Starting database setup...');
    
    const sql = neon(databaseUrl);
    
    // Test connection
    console.log('🔗 Testing database connection...');
    await sql`SELECT 1 as test`;
    console.log('✅ Database connection successful');

    // Create tables
    console.log('');
    console.log('📊 Creating user management tables...');
    
    // Users table
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

    // Sessions table
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

    // Permissions table
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

    // Activity log table
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

    // Create indexes
    console.log('');
    console.log('🔍 Creating database indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at)`;
    console.log('✅ Database indexes created');

    // Check for existing admin
    console.log('');
    console.log('👤 Setting up admin user...');
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
        
        // Add permissions
        await sql`
          INSERT INTO permissions (user_id, permission_type, granted_at)
          VALUES 
            (${adminId}, 'admin_access', CURRENT_TIMESTAMP),
            (${adminId}, 'user_management', CURRENT_TIMESTAMP),
            (${adminId}, 'system_settings', CURRENT_TIMESTAMP),
            (${adminId}, 'ticket_management', CURRENT_TIMESTAMP)
        `;
        
        // Log creation
        await sql`
          INSERT INTO activity_log (user_id, action, resource_type, details)
          VALUES (${adminId}, 'admin_created', 'user', '{"method": "interactive_setup"}')
        `;
        
        console.log('✅ Admin user created successfully!');
      }
    } else {
      console.log('✅ Admin user already exists');
    }

    // Verification
    console.log('');
    console.log('🔍 Verifying setup...');
    const userCount = await sql`SELECT COUNT(*) as count FROM users`;
    console.log(`👥 Total users in database: ${userCount[0].count}`);

    // Success message
    console.log('');
    console.log('🎉 DATABASE SETUP COMPLETED SUCCESSFULLY! 🎉');
    console.log('');
    console.log('📧 Admin Login Credentials:');
    console.log('   Email: admin@ticketmail.com');
    console.log('   Password: admin123456');
    console.log('');
    console.log('🔐 IMPORTANT: Change this password after first login!');
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('1. Visit https://ticketmail.netlify.app/');
    console.log('2. Click "Sign In"');
    console.log('3. Use the credentials above');
    console.log('4. Change the default password');
    console.log('5. Start managing your tickets!');

  } catch (error) {
    console.error('');
    console.error('❌ Setup failed:', error.message);
    console.error('');
    
    if (error.message.includes('connect') || error.message.includes('timeout')) {
      console.log('💡 Connection troubleshooting:');
      console.log('- Check your internet connection');
      console.log('- Verify the DATABASE_URL is correct');
      console.log('- Make sure your Neon database is running');
    } else if (error.message.includes('permission') || error.message.includes('authentication')) {
      console.log('💡 Authentication troubleshooting:');
      console.log('- Check your database username and password');
      console.log('- Verify your Neon project permissions');
    } else {
      console.log('💡 General troubleshooting:');
      console.log('- Try running the setup again');
      console.log('- Check the DATABASE-SETUP-GUIDE.md file for manual SQL setup');
    }
  }
}

// Start the interactive setup
setupDatabaseInteractive();