const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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

// Generate session token
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
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

        const { email, password } = JSON.parse(event.body);

        if (!email || !password) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Email and password are required' })
            };
        }

        // Get user by email
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (userError || !user) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Invalid credentials' })
            };
        }

        // Check if account is active
        if (!user.is_active) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Account is not active' })
            };
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Invalid credentials' })
            };
        }

        // Update last login
        await supabase
            .from('users')
            .update({
                last_login: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

        // Create session
        const sessionToken = generateSessionToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await supabase
            .from('sessions')
            .insert({
                user_id: user.id,
                session_token: sessionToken,
                expires_at: expiresAt.toISOString(),
                created_at: new Date().toISOString()
            });

        // Log successful login
        await supabase
            .from('activity_log')
            .insert({
                user_id: user.id,
                action: 'login',
                resource_type: 'auth',
                details: { ip: event.headers['x-forwarded-for'] || event.headers['x-real-ip'] },
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                created_at: new Date().toISOString()
            });

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    role: user.role
                },
                sessionToken,
                expiresAt: expiresAt.toISOString()
            })
        };
    } catch (error) {
        console.error('Login error:', error);

        if (error && error.code === 'MISSING_SUPABASE_ENV') {
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: error.message })
            };
        }

        // If Supabase rejected the request (bad key, missing table/column, etc.), return actionable details.
        // Avoid returning stack traces or any secret values.
        if (error && (error.code || error.details || error.hint)) {
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Login failed due to server configuration',
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
            body: JSON.stringify({ success: false, error: 'Internal server error' })
        };
    }
};