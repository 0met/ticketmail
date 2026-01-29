const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event, context) => {
    // Handle CORS
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
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        const queryParams = event.queryStringParameters || {};
        const filters = {};

        // Apply filters
        if (queryParams.role) filters.role = queryParams.role;
        if (queryParams.is_active !== undefined) filters.is_active = queryParams.is_active === 'true';
        if (queryParams.limit) filters.limit = parseInt(queryParams.limit);

        let query = supabase
            .from('users')
            .select('id, email, full_name, role, is_active, created_at, updated_at, last_login, company, department, job_title, phone')
            .order('created_at', { ascending: false });

        // Apply filters
        if (filters.role) {
            query = query.eq('role', filters.role);
        }
        if (filters.is_active !== undefined) {
            query = query.eq('is_active', filters.is_active);
        }
        if (filters.limit) {
            query = query.limit(filters.limit);
        }

        const { data: users, error } = await query;

        if (error) {
            throw error;
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                users: users,
                count: users.length
            })
        };
    } catch (error) {
        console.error('Error getting users:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Internal server error' })
        };
    }
};