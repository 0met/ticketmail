const { createClient } = require('@supabase/supabase-js');
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

        const { userId } = JSON.parse(event.body);
        const supabase = getSupabaseClient();

        if (!userId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'User ID is required' })
            };
        }

        // Prevent deleting the last admin?
        // Check if user is admin
        const { data: userToDelete, error: userToDeleteError } = await supabase
            .from('users')
            .select('id, role, email')
            .eq('id', userId)
            .single();

        if (userToDeleteError && userToDeleteError.code !== 'PGRST116') {
            throw userToDeleteError;
        }

        if (!userToDelete) {
            return {
                statusCode: 404,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'User not found' })
            };
        }

        if (userToDelete.role === 'admin') {
            const { count: adminCount, error: adminCountError } = await supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'admin');

            if (adminCountError) {
                throw adminCountError;
            }

            if ((adminCount || 0) <= 1) {
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: false, error: 'Cannot delete the last administrator' })
                };
            }
        }

        // Best-effort cleanup of sessions for that user
        try {
            await supabase.from('sessions').delete().eq('user_id', userId);
        } catch (e) {
            console.warn('Could not delete user sessions:', e);
        }

        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (deleteError) {
            throw deleteError;
        }

        await logActivity(
            sessionValidation.user.id,
            'user_deleted',
            'user',
            { targetUserId: userId, targetEmail: userToDelete.email },
            event.headers['x-forwarded-for'] || event.headers['x-real-ip']
        );

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: true, message: 'User deleted successfully' })
        };

    } catch (error) {
        console.error('Delete user error:', error);
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
