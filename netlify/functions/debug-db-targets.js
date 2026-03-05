const { neon } = require('@neondatabase/serverless');
const { createClient } = require('@supabase/supabase-js');

function getDirectSql() {
    const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
        return { ok: false, error: 'SUPABASE_DB_URL (or DATABASE_URL) is not set' };
    }
    return { ok: true, sql: neon(dbUrl) };
}

function getSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!url) {
        return { ok: false, error: 'SUPABASE_URL is not set' };
    }
    if (!key) {
        return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) is not set' };
    }

    return { ok: true, client: createClient(url, key), url, keyType: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon' };
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: false, error: 'Method not allowed. Use GET.' })
        };
    }

    const direct = { ok: false };
    const supabase = { ok: false };

    try {
        // Direct SQL via SUPABASE_DB_URL
        const directSql = getDirectSql();
        if (directSql.ok) {
            try {
                const rows = await directSql.sql`select current_database() as db, count(*)::int as tickets_count from tickets;`;
                direct.ok = true;
                direct.database = rows[0]?.db ?? null;
                direct.ticketsCount = rows[0]?.tickets_count ?? 0;
            } catch (e) {
                direct.ok = false;
                direct.error = e.message;
            }
        } else {
            direct.ok = false;
            direct.error = directSql.error;
        }

        // Supabase-js via SUPABASE_URL + key
        const sb = getSupabaseClient();
        if (sb.ok) {
            try {
                const { count, error } = await sb.client
                    .from('tickets')
                    .select('*', { count: 'exact', head: true });

                if (error) {
                    supabase.ok = false;
                    supabase.error = error.message;
                } else {
                    supabase.ok = true;
                    supabase.ticketsCount = count ?? 0;
                }

                supabase.url = sb.url;
                supabase.keyType = sb.keyType;
            } catch (e) {
                supabase.ok = false;
                supabase.error = e.message;
                supabase.url = sb.url;
                supabase.keyType = sb.keyType;
            }
        } else {
            supabase.ok = false;
            supabase.error = sb.error;
        }

        const mismatch = direct.ok && supabase.ok && direct.ticketsCount !== supabase.ticketsCount;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                direct,
                supabase,
                mismatch,
                hint: mismatch
                    ? 'Counts differ. SUPABASE_DB_URL may point to a different project/db than SUPABASE_URL+KEY.'
                    : 'Counts match (or one side failed). If supabase.ok is false, check SUPABASE_SERVICE_ROLE_KEY or RLS policies.'
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: error.message,
                stack: error.stack
            })
        };
    }
};
