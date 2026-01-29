const { getDatabase } = require('./netlify/functions/lib/database-local');

async function checkSessions() {
    const sql = getDatabase();
    const sessions = await sql`SELECT user_id, session_token, expires_at, created_at FROM sessions ORDER BY created_at DESC LIMIT 5`;
    console.log('Recent sessions:');
    sessions.forEach((session, i) => {
        console.log(`Session ${i+1}:`, {
            user_id: session.user_id,
            expires_at: session.expires_at,
            created_at: session.created_at,
            expired: new Date(session.expires_at) < new Date()
        });
    });
}

checkSessions().catch(console.error);