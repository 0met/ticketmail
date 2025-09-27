const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Initialize database connection
    const sql = neon(process.env.DATABASE_URL);
    
    console.log('🏗️ Setting up user management database...');
    
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
    console.log('✅ Users table created');

    // Create sessions table
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

    // Create permissions table
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

    // Create activity log table
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

    // Create indexes for better performance
    await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at)`;
    
    console.log('✅ Database indexes created');

    // Check if admin user already exists
    const existingAdmin = await sql`
      SELECT id, email FROM users WHERE role = 'admin' LIMIT 1
    `;

    let adminCreated = false;
    let adminEmail = 'admin@ticketmail.com';

    if (existingAdmin.length === 0) {
      // Create default admin user
      const bcrypt = require('bcryptjs');
      const defaultPassword = 'admin123456';
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);

      const newAdmin = await sql`
        INSERT INTO users (email, password_hash, full_name, role, is_active)
        VALUES (${adminEmail}, ${hashedPassword}, 'System Administrator', 'admin', true)
        RETURNING id, email
      `;

      // Add admin permissions
      if (newAdmin.length > 0) {
        await sql`
          INSERT INTO permissions (user_id, permission_type, granted_at)
          VALUES 
            (${newAdmin[0].id}, 'admin_access', CURRENT_TIMESTAMP),
            (${newAdmin[0].id}, 'user_management', CURRENT_TIMESTAMP),
            (${newAdmin[0].id}, 'system_settings', CURRENT_TIMESTAMP)
        `;
        
        // Log the admin creation
        await sql`
          INSERT INTO activity_log (user_id, action, resource_type, details)
          VALUES (${newAdmin[0].id}, 'admin_created', 'user', '{"method": "auto_setup"}')
        `;
        
        adminCreated = true;
        console.log('✅ Admin user created');
      }
    } else {
      adminEmail = existingAdmin[0].email;
      console.log('✅ Admin user already exists');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'User management system setup completed successfully!',
        details: {
          tablesCreated: ['users', 'sessions', 'permissions', 'activity_log'],
          indexesCreated: true,
          adminUser: {
            created: adminCreated,
            email: adminEmail,
            defaultPassword: adminCreated ? 'admin123456' : 'existing'
          }
        },
        nextSteps: [
          'Visit your TicketMail application',
          `Login with: ${adminEmail}`,
          adminCreated ? 'Use password: admin123456' : 'Use your existing password',
          'Change the default password immediately'
        ]
      })
    };

  } catch (error) {
    console.error('❌ Database setup error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Database setup failed',
        details: error.message,
        troubleshooting: [
          'Check if DATABASE_URL environment variable is set',
          'Verify database connection is working',
          'Check Neon database permissions'
        ]
      })
    };
  }
};