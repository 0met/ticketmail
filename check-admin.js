const { getDatabase } = require('./netlify/functions/lib/database-local');

async function checkAdmin() {
    const sql = getDatabase();
    const users = await sql`SELECT id, email, password_hash, role FROM users WHERE email = 'admin@ticketmail.com'`;
    console.log('Admin user:', users[0]);
}

checkAdmin().catch(console.error);