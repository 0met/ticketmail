const readline = require('readline');
const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');

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

async function resetPassword() {
  console.log('🔐 TicketMail Admin Password Reset Tool');
  console.log('=======================================');
  console.log('');

  // 1. Get Database URL
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('📋 Please enter your Neon database connection string.');
    console.log('   (It starts with postgresql://...)');
    databaseUrl = await askQuestion('🔗 DATABASE_URL: ');
  }

  if (!databaseUrl || !databaseUrl.startsWith('postgresql://')) {
    console.log('❌ Invalid connection string. It must start with postgresql://');
    rl.close();
    return;
  }

  // 2. Get Email
  const email = await askQuestion('👤 Enter email to reset (default: admin@ticketmail.com): ') || 'admin@ticketmail.com';

  // 3. Get New Password
  const newPassword = await askQuestion('🔑 Enter new password: ');
  if (!newPassword) {
    console.log('❌ Password cannot be empty.');
    rl.close();
    return;
  }

  try {
    console.log('');
    console.log('⏳ Connecting to database...');
    const sql = neon(databaseUrl);

    // Check if user exists
    const users = await sql`SELECT id FROM users WHERE email = ${email}`;
    
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    if (users.length === 0) {
      console.log(`⚠️ User ${email} not found. Creating new admin user...`);
      
      const newUser = await sql`
        INSERT INTO users (email, password_hash, full_name, role, is_active)
        VALUES (${email}, ${hashedPassword}, 'System Administrator', 'admin', true)
        RETURNING id
      `;
      
      const userId = newUser[0].id;
      
      // Add permissions
      await sql`
        INSERT INTO permissions (user_id, permission_type, granted_at)
        VALUES 
          (${userId}, 'admin_access', CURRENT_TIMESTAMP),
          (${userId}, 'user_management', CURRENT_TIMESTAMP),
          (${userId}, 'system_settings', CURRENT_TIMESTAMP),
          (${userId}, 'ticket_management', CURRENT_TIMESTAMP)
      `;
      
      console.log('✅ New admin user created successfully!');
    } else {
      console.log(`🔄 Updating password for ${email}...`);
      
      await sql`
        UPDATE users 
        SET password_hash = ${hashedPassword}, updated_at = CURRENT_TIMESTAMP
        WHERE email = ${email}
      `;
      
      console.log('✅ Password updated successfully!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    rl.close();
  }
}

resetPassword();
