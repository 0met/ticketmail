const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { validateSession, logActivity } = require('./lib/auth');

function getSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

function getBearerToken(headers) {
    const authHeader = headers.authorization || headers.Authorization;
    if (!authHeader) return null;
    return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : authHeader;
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
        // Validate session (admin only)
        const token = getBearerToken(event.headers || {});
        if (!token) {
            return {
                statusCode: 401,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'No authorization token provided' })
            };
        }

        const sessionValidation = await validateSession(token);
        if (!sessionValidation.valid) {
            return {
                statusCode: 401,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'Invalid session' })
            };
        }

        if (sessionValidation.user.role !== 'admin') {
            return {
                statusCode: 403,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'Insufficient permissions' })
            };
        }

        const { userId, fullName, email, role, isActive, password, companyId, department, jobTitle, phone } = JSON.parse(event.body);
        const supabase = getSupabaseClient();

        if (!userId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'User ID is required' })
            };
        }

        // Check if user exists
        const { data: existingUser, error: existingError } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('id', userId)
            .single();

        if (existingError && existingError.code !== 'PGRST116') {
            throw existingError;
        }

        if (!existingUser) {
            return {
                statusCode: 404,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'User not found' })
            };
        }

        const updates = {
            updated_at: new Date().toISOString()
        };

        if (fullName !== undefined) updates.full_name = fullName || null;
        if (email !== undefined) updates.email = email;
        if (role !== undefined) updates.role = role;
        if (typeof isActive === 'boolean') updates.is_active = isActive;
        if (companyId !== undefined) {
            updates.company_id = companyId === null || companyId === '' ? null : companyId;
        }
        if (department !== undefined) updates.department = department;
        if (jobTitle !== undefined) updates.job_title = jobTitle;
        if (phone !== undefined) updates.phone = phone;

        if (password) {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            updates.password_hash = hash;
        }

        const { error: updateError } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId);

        if (updateError) {
            throw updateError;
        }

        await logActivity(
            sessionValidation.user.id,
            'user_updated',
            'user',
            { targetUserId: userId, updates: Object.keys(updates) },
            event.headers['x-forwarded-for'] || event.headers['x-real-ip']
        );

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: true, message: 'User updated successfully' })
        };

    } catch (error) {
        console.error('Update user error:', error);
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
