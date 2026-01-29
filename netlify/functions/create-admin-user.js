const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

function getAdminKey(event, body) {
    const headerKey = event.headers?.['x-admin-key'] || event.headers?.['X-Admin-Key'];
    return body?.adminKey || headerKey || event.queryStringParameters?.adminKey || null;
}

function isAuthorizedAdminKey(providedKey) {
    if (!providedKey) return false;
    const expected = process.env.ADMIN_SETUP_KEY || process.env.SECRET_KEY;
    if (!expected) return false;
    return providedKey === expected;
}

function getSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    return createClient(supabaseUrl, serviceKey, {
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
                'Access-Control-Allow-Headers': 'Content-Type'
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
        const body = event.body ? JSON.parse(event.body) : {};
        const adminKey = getAdminKey(event, body);

        if (!isAuthorizedAdminKey(adminKey)) {
            return {
                statusCode: 403,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Forbidden'
                })
            };
        }

        const email = body.email || 'admin@ticketmail.com';
        const password = body.password || 'admin123456';
        const fullName = body.fullName || 'System Administrator';

        if (typeof password !== 'string' || password.length < 8) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Password must be at least 8 characters long'
                })
            };
        }

        const supabase = getSupabase();
        const passwordHash = await bcrypt.hash(password, 12);

        // Find existing admin user
        const { data: existingUser, error: existingError } = await supabase
            .from('users')
            .select('id, email')
            .eq('email', email)
            .maybeSingle();

        if (existingError) {
            throw existingError;
        }

        let user;

        if (existingUser?.id) {
            const { data: updated, error: updateError } = await supabase
                .from('users')
                .update({
                    full_name: fullName,
                    role: 'admin',
                    is_active: true,
                    password_hash: passwordHash,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingUser.id)
                .select('id, email, full_name, role, is_active')
                .single();

            if (updateError) {
                throw updateError;
            }
            user = updated;
        } else {
            const { data: created, error: insertError } = await supabase
                .from('users')
                .insert({
                    email,
                    password_hash: passwordHash,
                    full_name: fullName,
                    role: 'admin',
                    is_active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select('id, email, full_name, role, is_active')
                .single();

            if (insertError) {
                throw insertError;
            }
            user = created;
        }

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Admin credentials set successfully',
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    role: user.role,
                    isActive: user.is_active
                }
            })
        };
    } catch (error) {
        console.error('Error setting admin credentials:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error'
            })
        };
    }
};