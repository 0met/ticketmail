const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'local-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('👤 Creating Local Admin User...');

const adminEmail = 'admin@ticketmail.com';
const adminPassword = 'admin123456';

async function createAdmin() {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    db.serialize(() => {
        // 1. Check if user exists
        db.get("SELECT id FROM users WHERE email = ?", [adminEmail], (err, row) => {
            if (err) {
                console.error("❌ Error checking user:", err);
                return;
            }

            if (row) {
                console.log(`⚠️ Admin user ${adminEmail} already exists.`);
                return;
            }

            // 2. Insert User
            const insertUser = db.prepare(`
                INSERT INTO users (email, password_hash, full_name, role, is_active)
                VALUES (?, ?, 'Local Administrator', 'admin', 1)
            `);

            insertUser.run(adminEmail, hashedPassword, function (err) {
                if (err) {
                    console.error("❌ Error creating user:", err);
                    return;
                }

                const userId = this.lastID;
                console.log(`✅ User created with ID: ${userId}`);

                // 3. Insert Permissions
                const insertPerms = db.prepare(`
                    INSERT INTO permissions (user_id, permission_type)
                    VALUES (?, ?)
                `);

                const perms = ['admin_access', 'user_management', 'system_settings', 'ticket_management'];
                perms.forEach(p => insertPerms.run(userId, p));
                insertPerms.finalize();

                console.log('✅ Permissions granted.');
                console.log('');
                console.log('🎉 Login Credentials:');
                console.log(`   Email: ${adminEmail}`);
                console.log(`   Password: ${adminPassword}`);
            });
            insertUser.finalize();
        });
    });
}

createAdmin();
