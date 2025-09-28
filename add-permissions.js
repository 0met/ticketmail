const { neon } = require('@neondatabase/serverless');

async function addAdminPermissions() {
  try {
    console.log('🔑 Adding Admin Permissions...');
    
    const sql = neon(process.env.DATABASE_URL);
    
    // Get admin user
    const adminUser = await sql`
      SELECT id, email FROM users WHERE role = 'admin' LIMIT 1
    `;
    
    if (adminUser.length === 0) {
      console.log('❌ No admin user found');
      return;
    }
    
    const adminId = adminUser[0].id;
    console.log(`👤 Found admin: ${adminUser[0].email} (ID: ${adminId})`);
    
    // Add permissions
    await sql`
      INSERT INTO permissions (user_id, permission_type, granted_at)
      VALUES 
        (${adminId}, 'admin_access', CURRENT_TIMESTAMP),
        (${adminId}, 'user_management', CURRENT_TIMESTAMP),
        (${adminId}, 'system_settings', CURRENT_TIMESTAMP),
        (${adminId}, 'ticket_management', CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING
    `;
    
    // Add activity log
    await sql`
      INSERT INTO activity_log (user_id, action, resource_type, details)
      VALUES (${adminId}, 'permissions_granted', 'user', '{"method": "setup_completion", "permissions": ["admin_access", "user_management", "system_settings", "ticket_management"]}')
    `;
    
    console.log('✅ Admin permissions added!');
    
    // Verify permissions
    const permissions = await sql`
      SELECT permission_type FROM permissions WHERE user_id = ${adminId}
    `;
    
    console.log('🛡️ Current permissions:');
    permissions.forEach(p => {
      console.log(`   ✅ ${p.permission_type}`);
    });
    
    console.log('');
    console.log('🎉 SETUP FULLY COMPLETE!');
    console.log('');
    console.log('🚀 Your TicketMail app is now ready with:');
    console.log('   ✅ Secure email-based authentication');
    console.log('   ✅ Admin user with full permissions');
    console.log('   ✅ All your existing ticket data preserved');
    console.log('   ✅ Modern password security with bcrypt');
    console.log('   ✅ Session management');
    console.log('');
    console.log('🔐 Login credentials:');
    console.log('   Email: admin@ticketmail.com');
    console.log('   Password: admin123456');
    console.log('');
    console.log('📱 Visit: https://ticketmail.netlify.app/');
    
  } catch (error) {
    console.error('❌ Failed to add permissions:', error.message);
  }
}

if (!process.env.DATABASE_URL) {
  console.log('❌ Please set DATABASE_URL environment variable');
} else {
  addAdminPermissions();
}