const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        const missing = [!url ? 'SUPABASE_URL' : null, !key ? 'SUPABASE_SERVICE_ROLE_KEY' : null].filter(Boolean);
        const error = new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
        error.code = 'MISSING_SUPABASE_ENV';
        throw error;
    }

    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
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
        const supabase = getSupabaseClient();
        const { sessionToken } = JSON.parse(event.body);

        if (!sessionToken) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ valid: false, error: 'Session token is required' })
            };
        }

        // Get session with user data
        const { data: session, error } = await supabase
            .from('sessions')
            .select(`
                *,
                users!inner(id, email, full_name, role, is_active)
            `)
            .eq('session_token', sessionToken)
            .gt('expires_at', new Date().toISOString())
            .single();

        if (error || !session) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ valid: false, error: 'Invalid or expired session' })
            };
        }

        // Check if user account is still active
        if (!session.users.is_active) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ valid: false, error: 'User account is not active' })
            };
        }

        const normalizedRole = (session.users.role || 'customer').toString().trim().toLowerCase();
        const permissionsByRole = {
            admin: ['admin_access', 'ticket_management', 'user_management', 'settings_access'],
            agent: ['ticket_management', 'settings_access'],
            customer: ['customer_access', 'settings_access']
        };
        const permissions = permissionsByRole[normalizedRole] || [];

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                valid: true,
                user: {
                    id: session.users.id,
                    email: session.users.email,
                    fullName: session.users.full_name,
                    role: normalizedRole
                },
                permissions
            })
        };
    } catch (error) {
        console.error('Session validation error:', error);

        if (error && error.code === 'MISSING_SUPABASE_ENV') {
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ valid: false, error: error.message })
            };
        }

        if (error && (error.code || error.details || error.hint)) {
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    valid: false,
                    error: 'Session validation failed due to server configuration',
                    details: {
                        message: error.message,
                        code: error.code,
                        details: error.details,
                        hint: error.hint
                    }
                })
            };
        }

        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ valid: false, error: 'Internal server error' })
        };
    }
};