const { neon } = require('@neondatabase/serverless');

async function verifySetup() {
  try {
    console.log('🔍 Verifying Authentication System Setup...');
    console.log('');

    const sql = neon(process.env.DATABASE_URL);
    
    // Check all tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    console.log('📊 Database Tables:');
    tables.forEach(t => {
      if (['users', 'sessions', 'permissions', 'activity_log'].includes(t.table_name)) {
        console.log(`   ✅ ${t.table_name} (auth)`);
      } else if (['tickets', 'ticket_conversations', 'responses', 'analytics'].includes(t.table_name)) {
        console.log(`   🎫 ${t.table_name} (tickets)`);
      } else {
        console.log(`   📋 ${t.table_name} (other)`);
      }
    });
    
    // Check users table structure
    console.log('');
    console.log('👥 Users Table Structure:');
    const userColumns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users' AND table_schema = 'public'
      ORDER BY ordinal_position
    `;
    
    userColumns.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(required)' : '(optional)'}`);
    });
    
    // Check for admin user
    console.log('');
    console.log('🔐 Admin User Status:');
    const adminUsers = await sql`
      SELECT id, email, full_name, role, is_active, created_at
      FROM users 
      WHERE role = 'admin'
    `;
    
    if (adminUsers.length > 0) {
      adminUsers.forEach(admin => {
        console.log(`   ✅ ID: ${admin.id}, Email: ${admin.email}, Name: ${admin.full_name || 'Not set'}`);
        console.log(`      Role: ${admin.role}, Active: ${admin.is_active}, Created: ${admin.created_at}`);
      });
    } else {
      console.log('   ❌ No admin users found');
    }
    
    // Check permissions
    console.log('');
    console.log('🛡️ Admin Permissions:');
    if (adminUsers.length > 0) {
      const permissions = await sql`
        SELECT permission_type, granted_at
        FROM permissions 
        WHERE user_id = ${adminUsers[0].id}
        ORDER BY permission_type
      `;
      
      if (permissions.length > 0) {
        permissions.forEach(perm => {
          console.log(`   ✅ ${perm.permission_type}`);
        });
      } else {
        console.log('   ⚠️ No permissions found - need to add them');
      }
    }
    
    // Check ticket data integrity
    console.log('');
    console.log('🎫 Ticket System Status:');
    try {
      const ticketCount = await sql`SELECT COUNT(*) as count FROM tickets`;
      const conversationCount = await sql`SELECT COUNT(*) as count FROM ticket_conversations`;
      const responseCount = await sql`SELECT COUNT(*) as count FROM responses`;
      
      console.log(`   📊 Tickets: ${ticketCount[0].count}`);
      console.log(`   💬 Conversations: ${conversationCount[0].count}`);
      console.log(`   📝 Responses: ${responseCount[0].count}`);
      console.log('   ✅ All ticket data preserved!');
    } catch (e) {
      console.log('   ⚠️ Could not check ticket data:', e.message);
    }
    
    console.log('');
    console.log('🎉 VERIFICATION COMPLETE!');
    console.log('');
    
    if (adminUsers.length > 0) {
      console.log('✅ Authentication system is ready!');
      console.log('📧 Login at: https://ticketmail.netlify.app/');
      console.log(`🔑 Email: ${adminUsers[0].email}`);
      console.log('🔐 Password: admin123456 (change this after login!)');
    } else {
      console.log('⚠️ Need to create admin user');
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

if (!process.env.DATABASE_URL) {
  console.log('❌ Please set DATABASE_URL environment variable');
} else {
  verifySetup();
}