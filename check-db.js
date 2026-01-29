const { getDatabase } = require('./netlify/functions/lib/database-local');

async function checkTables() {
    const sql = getDatabase();
    const tables = await sql`SELECT name FROM sqlite_master WHERE type='table'`;
    console.log('Tables:', tables.map ? tables.map(t => t.name) : tables);

    const users = await sql`SELECT email, role FROM users`;
    console.log('Users:', users);
}

checkTables().catch(console.error);