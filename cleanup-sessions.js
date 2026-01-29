const { getDatabase } = require('./netlify/functions/lib/database-local');

async function cleanupSessions() {
    const sql = getDatabase();

    // Delete sessions with invalid dates (not starting with YYYY-MM-DD)
    await sql`DELETE FROM sessions WHERE expires_at NOT LIKE '____-__-__%'`;

    // Delete expired sessions
    await sql`DELETE FROM sessions WHERE expires_at < datetime('now')`;

    console.log('Cleaned up invalid and expired sessions');

    // Check remaining sessions
    const sessions = await sql`SELECT COUNT(*) as count FROM sessions`;
    console.log('Remaining sessions:', sessions[0].count);
}

cleanupSessions().catch(console.error);