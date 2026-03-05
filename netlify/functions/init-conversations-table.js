const { neon } = require('@neondatabase/serverless');

function getDatabase() {
    const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('SUPABASE_DB_URL (or DATABASE_URL) environment variable is not set');
    }
    return neon(dbUrl);
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    if (!['GET', 'POST'].includes(event.httpMethod)) {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: 'Method not allowed. Use GET or POST.' })
        };
    }

    try {
        const sql = getDatabase();
        const actions = [];

        const tableExists = await sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = 'ticket_conversations'
            );
        `;

        if (!tableExists[0]?.exists) {
            await sql`
                CREATE TABLE ticket_conversations (
                    id BIGSERIAL PRIMARY KEY,
                    ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
                    email_message_id TEXT,
                    message_type TEXT NOT NULL DEFAULT 'system',
                    from_email TEXT,
                    to_email TEXT,
                    subject TEXT,
                    message TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            `;
            actions.push('Created ticket_conversations table');
        } else {
            actions.push('ticket_conversations table already exists');
        }

        // Ensure columns exist (safe on older installs)
        const ensure = async (sqlCall) => {
            try {
                await sqlCall;
            } catch {
                // ignore
            }
        };

        await ensure(sql`ALTER TABLE ticket_conversations ADD COLUMN IF NOT EXISTS message_type TEXT;`);
        await ensure(sql`ALTER TABLE ticket_conversations ADD COLUMN IF NOT EXISTS email_message_id TEXT;`);
        await ensure(sql`ALTER TABLE ticket_conversations ADD COLUMN IF NOT EXISTS from_email TEXT;`);
        await ensure(sql`ALTER TABLE ticket_conversations ADD COLUMN IF NOT EXISTS to_email TEXT;`);
        await ensure(sql`ALTER TABLE ticket_conversations ADD COLUMN IF NOT EXISTS subject TEXT;`);
        await ensure(sql`ALTER TABLE ticket_conversations ADD COLUMN IF NOT EXISTS message TEXT;`);
        await ensure(sql`ALTER TABLE ticket_conversations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;`);

        await ensure(sql`CREATE INDEX IF NOT EXISTS idx_ticket_conversations_ticket_id ON ticket_conversations(ticket_id);`);
        await ensure(sql`CREATE INDEX IF NOT EXISTS idx_ticket_conversations_created_at ON ticket_conversations(created_at);`);
        await ensure(sql`CREATE INDEX IF NOT EXISTS idx_ticket_conversations_email_message_id ON ticket_conversations(email_message_id);`);
        // Prevent duplicate inserts when re-syncing the last 24h window.
        await ensure(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_ticket_conversations_email_message_id ON ticket_conversations(email_message_id) WHERE email_message_id IS NOT NULL;`);

        const count = await sql`SELECT COUNT(*)::int as count FROM ticket_conversations;`;

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                tableExists: true,
                rowCount: count[0]?.count ?? 0,
                actions,
                message: actions.join('. ') + `. Current conversation rows: ${count[0]?.count ?? 0}`
            })
        };
    } catch (error) {
        const msg = String(error && error.message ? error.message : error);
        const lower = msg.toLowerCase();
        const isMissingDbUrl = (lower.includes('supabase_db_url') || lower.includes('database_url')) && lower.includes('not set');

        if (isMissingDbUrl) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: 'Cannot initialize tables because SUPABASE_DB_URL (or DATABASE_URL) is not configured in Netlify environment variables.',
                    hint: 'Set SUPABASE_DB_URL to your Supabase Postgres connection string, or run the CREATE TABLE statement in Supabase SQL editor.'
                })
            };
        }

        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: msg })
        };
    }
};
