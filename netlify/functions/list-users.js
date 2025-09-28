const { neon } = require('@neondatabase/serverless');

function getDatabase() {
    return neon(process.env.DATABASE_URL);
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // Handle CORS preflight requests
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
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        const sql = getDatabase();
        
        // Get all users with their basic info (no passwords)
        const users = await sql`
            SELECT 
                u.id,
                u.email,
                u.full_name,
                u.role,
                u.is_active,
                u.created_at,
                u.last_login,
                (SELECT COUNT(*) FROM permissions p WHERE p.user_id = u.id) as permission_count
            FROM users u
            ORDER BY u.created_at DESC
        `;

        // Get user activity counts
        const userStats = await sql`
            SELECT 
                user_id,
                COUNT(*) as activity_count,
                MAX(created_at) as last_activity
            FROM activity_log 
            GROUP BY user_id
        `;

        // Combine user data with stats
        const usersWithStats = users.map(user => {
            const stats = userStats.find(s => s.user_id === user.id);
            return {
                ...user,
                activityCount: stats ? parseInt(stats.activity_count) : 0,
                lastActivity: stats ? stats.last_activity : null
            };
        });

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                users: usersWithStats,
                total: users.length,
                roles: {
                    admin: users.filter(u => u.role === 'admin').length,
                    agent: users.filter(u => u.role === 'agent').length,
                    customer: users.filter(u => u.role === 'customer').length
                }
            })
        };

    } catch (error) {
        console.error('List users error:', error);
        
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