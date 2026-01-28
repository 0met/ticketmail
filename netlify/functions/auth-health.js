const { createClient } = require('@supabase/supabase-js');

function getAdminKeyFromRequest(event) {
    const qp = event.queryStringParameters || {};
    return (
        qp.adminKey ||
        (event.headers && (event.headers['x-admin-key'] || event.headers['X-Admin-Key'])) ||
        null
    );
}

function requireAdminKey(event) {
    const provided = getAdminKeyFromRequest(event);
    const expected = process.env.ADMIN_SETUP_KEY || process.env.SECRET_KEY;

    if (!expected) {
        const err = new Error('Server is missing ADMIN_SETUP_KEY (or SECRET_KEY)');
        err.statusCode = 500;
        throw err;
    }

    if (!provided || provided !== expected) {
        const err = new Error('Unauthorized');
        err.statusCode = 401;
        throw err;
    }
}

function getSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        const missing = [!url ? 'SUPABASE_URL' : null, !key ? 'SUPABASE_SERVICE_ROLE_KEY' : null].filter(Boolean);
        const err = new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
        err.code = 'MISSING_SUPABASE_ENV';
        throw err;
    }

    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

async function safeProbe(promise) {
    try {
        const result = await promise;
        return { ok: true, result };
    } catch (error) {
        return {
            ok: false,
            error: {
                name: error?.name,
                message: error?.message,
                code: error?.code,
                details: error?.details,
                hint: error?.hint
            }
        };
    }
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key'
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
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        requireAdminKey(event);

        const env = {
            nodeEnv: process.env.NODE_ENV || null,
            hasSupabaseUrl: !!process.env.SUPABASE_URL,
            hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            hasAnonKey: !!process.env.SUPABASE_ANON_KEY
        };

        const supabase = getSupabaseClient();

        const probes = {
            usersSelect: await safeProbe(
                supabase.from('users').select('id').limit(1)
            ),
            sessionsSelect: await safeProbe(
                supabase.from('sessions').select('session_token').limit(1)
            ),
            activityLogSelect: await safeProbe(
                supabase.from('activity_log').select('id').limit(1)
            ),
            usersPasswordHashColumn: await safeProbe(
                supabase.from('users').select('password_hash').limit(1)
            )
        };

        // Normalize Supabase response payloads (don’t return large data)
        for (const [key, probe] of Object.entries(probes)) {
            if (probe.ok && probe.result) {
                const { error, data, count, status } = probe.result;
                probe.result = {
                    status: status ?? null,
                    count: typeof count === 'number' ? count : null,
                    dataLength: Array.isArray(data) ? data.length : data ? 1 : 0,
                    error: error
                        ? {
                              message: error.message,
                              code: error.code,
                              details: error.details,
                              hint: error.hint
                          }
                        : null
                };
            }
        }

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: true, env, probes })
        };
    } catch (error) {
        const statusCode = error?.statusCode || 500;
        return {
            statusCode,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: error?.message || 'Internal server error'
            })
        };
    }
};
