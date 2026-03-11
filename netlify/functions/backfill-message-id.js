const { createClient } = require('@supabase/supabase-js');
const { neon } = require('@neondatabase/serverless');

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}

function getSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        const missing = [!url ? 'SUPABASE_URL' : null, !key ? 'SUPABASE_SERVICE_ROLE_KEY' : null]
            .filter(Boolean);
        const error = new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
        error.code = 'MISSING_SUPABASE_ENV';
        throw error;
    }

    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

function getSqlDatabase() {
    const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
        const error = new Error('SUPABASE_DB_URL (or DATABASE_URL) environment variable is not set');
        error.code = 'MISSING_DB_URL';
        throw error;
    }
    return neon(dbUrl);
}

async function validateAdmin(event) {
    const headers = event && event.headers ? event.headers : {};
    const authHeader = (headers.authorization || headers.Authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';

    if (!token) {
        return { ok: false, statusCode: 401, error: 'Missing Authorization Bearer token' };
    }

    const supabase = getSupabaseClient();

    const { data: session, error } = await supabase
        .from('sessions')
        .select('session_token, expires_at, users!inner(id, email, full_name, role, is_active)')
        .eq('session_token', token)
        .gt('expires_at', new Date().toISOString())
        .single();

    if (error || !session) {
        return { ok: false, statusCode: 401, error: 'Invalid or expired session' };
    }

    if (!session.users?.is_active) {
        return { ok: false, statusCode: 401, error: 'User account is not active' };
    }

    const role = String(session.users?.role || 'customer').trim().toLowerCase();
    if (role !== 'admin') {
        return { ok: false, statusCode: 403, error: 'Admin privileges required' };
    }

    return {
        ok: true,
        user: {
            id: session.users.id,
            email: session.users.email,
            fullName: session.users.full_name,
            role
        }
    };
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders(), body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: 'Method not allowed. Use POST.' })
        };
    }

    try {
        const adminCheck = await validateAdmin(event);
        if (!adminCheck.ok) {
            return {
                statusCode: adminCheck.statusCode,
                headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: adminCheck.error })
            };
        }

        const payload = event.body ? JSON.parse(event.body) : {};
        const confirm = Boolean(payload && payload.confirm === true);
        const enforceNotNull = Boolean(!payload || payload.enforceNotNull !== false);

        const sql = getSqlDatabase();

        const actions = [];
        const nullCountRows = await sql`SELECT COUNT(*)::int AS count FROM tickets WHERE message_id IS NULL;`;
        const nullCount = (nullCountRows && nullCountRows[0] && Number.isFinite(nullCountRows[0].count))
            ? nullCountRows[0].count
            : 0;

        const totalRows = await sql`SELECT COUNT(*)::int AS count FROM tickets;`;
        const total = (totalRows && totalRows[0] && Number.isFinite(totalRows[0].count))
            ? totalRows[0].count
            : 0;

        if (!confirm) {
            return {
                statusCode: 200,
                headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    dryRun: true,
                    nullMessageIdCount: nullCount,
                    totalTickets: total,
                    message: 'Dry run: no changes made. Re-run with {"confirm": true} in POST body to backfill message_id for NULL rows.'
                })
            };
        }

        if (nullCount === 0) {
            actions.push('No tickets with NULL message_id; nothing to backfill');
        } else {
            await sql`BEGIN;`;
            try {
                const updatedRows = await sql`
                    UPDATE tickets
                    SET message_id = CONCAT('backfill-null-message-id:', id::text)
                    WHERE message_id IS NULL
                    RETURNING id;
                `;
                actions.push(`Backfilled message_id for ${Array.isArray(updatedRows) ? updatedRows.length : 0} tickets`);

                await sql`COMMIT;`;
            } catch (e) {
                try {
                    await sql`ROLLBACK;`;
                } catch (_) {
                    // ignore
                }
                throw e;
            }
        }

        const afterNullRows = await sql`SELECT COUNT(*)::int AS count FROM tickets WHERE message_id IS NULL;`;
        const afterNullCount = (afterNullRows && afterNullRows[0] && Number.isFinite(afterNullRows[0].count))
            ? afterNullRows[0].count
            : 0;

        if (enforceNotNull) {
            try {
                if (afterNullCount === 0) {
                    await sql`ALTER TABLE tickets ALTER COLUMN message_id SET NOT NULL;`;
                    actions.push('Set tickets.message_id to NOT NULL');
                } else {
                    actions.push(`Skipped NOT NULL enforcement; ${afterNullCount} rows still NULL`);
                }
            } catch (e) {
                actions.push(`Could not set message_id NOT NULL: ${e.message}`);
            }

            try {
                await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_message_id_unique ON tickets(message_id);`;
                actions.push('Ensured unique index on tickets.message_id');
            } catch (e) {
                actions.push(`Could not ensure unique index: ${e.message}`);
            }
        }

        return {
            statusCode: 200,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                user: adminCheck.user,
                nullMessageIdCountBefore: nullCount,
                nullMessageIdCountAfter: afterNullCount,
                totalTickets: total,
                actions
            })
        };
    } catch (error) {
        console.error('Error in backfill-message-id function:', error);

        const code = error && error.code;
        const statusCode = (code === 'MISSING_SUPABASE_ENV' || code === 'MISSING_DB_URL') ? 500 : 500;

        return {
            statusCode,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: (error && error.message) ? error.message : 'Internal server error'
            })
        };
    }
};
