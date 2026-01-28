const { getDatabase } = require('./lib/database-local');

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

        // Get all users with their basic info (no passwords) and company details
        const users = await sql`
            SELECT 
                u.id,
                u.email,
                u.full_name,
                u.role,
                u.is_active,
                u.created_at,
                u.last_login,
                u.company_id,
                u.department,
                u.job_title,
                u.phone,
                c.name as company_name,
                c.domain as company_domain,
                (SELECT COUNT(*) FROM permissions p WHERE p.user_id = u.id) as permission_count,
                (SELECT COUNT(*) FROM tickets t WHERE t.assigned_to = u.id AND t.status != 'closed') as open_ticket_count
            FROM users u
            LEFT JOIN companies c ON u.company_id = c.id
            ORDER BY u.created_at DESC
        `;

        // Get user activity counts
        // Note: In SQLite, we might need to handle the case where activity_log is empty or missing
        let userStats = [];
        try {
            userStats = await sql`
                SELECT 
                    user_id,
                    COUNT(*) as activity_count,
                    MAX(created_at) as last_activity
                FROM activity_log 
                GROUP BY user_id
            `;
        } catch (e) {
            console.warn('Could not fetch activity stats:', e);
        }

        // Combine user data with stats
        const usersWithStats = users.map(user => {
            const stats = userStats.find(s => s.user_id === user.id);
            return {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role,
                isActive: user.is_active,
                createdAt: user.created_at,
                lastLogin: user.last_login,
                companyId: user.company_id,
                companyName: user.company_name,
                companyDomain: user.company_domain,
                department: user.department,
                jobTitle: user.job_title,
                phone: user.phone,
                permissionCount: parseInt(user.permission_count) || 0,
                openTicketCount: parseInt(user.open_ticket_count) || 0,
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