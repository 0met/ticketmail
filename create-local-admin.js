const bcrypt = require('bcryptjs');
const { getDatabase, closePool } = require('./netlify/functions/lib/database-local');

const sql = getDatabase();

console.log('👤 Creating Local Admin User...');

const adminEmail = 'admin@ticketmail.com';
const adminPassword = 'admin123456';

async function createAdmin() {
    try {
        const hashedPassword = await bcrypt.hash(adminPassword, 12);

        const existing = await sql`
            SELECT id FROM users WHERE email = ${adminEmail} LIMIT 1
        `;

        if (existing.length) {
            console.log(`⚠️ Admin user ${adminEmail} already exists (ID ${existing[0].id}).`);
            return;
        }

        const insertUser = await sql`
            INSERT INTO users (email, password_hash, full_name, role, is_active)
            VALUES (${adminEmail}, ${hashedPassword}, 'Local Administrator', 'admin', true)
            RETURNING id
        `;

        const userId = insertUser.rows[0].id;
        console.log(`✅ User created with ID: ${userId}`);

        const permissions = ['admin_access', 'user_management', 'system_settings', 'ticket_management'];
        for (const permission of permissions) {
            await sql`
                INSERT INTO permissions (user_id, permission_type)
                VALUES (${userId}, ${permission})
            `;
        }

        console.log('✅ Permissions granted.');
        console.log('');
        console.log('🎉 Login Credentials:');
        console.log(`   Email: ${adminEmail}`);
        console.log(`   Password: ${adminPassword}`);
    } catch (error) {
        console.error('❌ Failed to create admin user:', error);
    } finally {
        await closePool();
    }
}

createAdmin();
