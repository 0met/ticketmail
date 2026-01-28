const { getDatabase } = require('./lib/database');

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

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed. Use GET.'
            })
        };
    }

    try {
        const sql = getDatabase();

        // Get query parameters
        const params = event.queryStringParameters || {};
        const timeframe = params.timeframe || '30'; // days
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(timeframe));

        console.log(`Generating analytics for last ${timeframe} days`);

        // Basic statistics
        const totalTickets = await sql`
            SELECT COUNT(*) as count FROM tickets
        `;

        const ticketsByStatus = await sql`
            SELECT status, COUNT(*) as count 
            FROM tickets 
            GROUP BY status
        `;

        const ticketsByCategory = await sql`
            SELECT 
                COALESCE(category, 'general') as category, 
                COUNT(*) as count 
            FROM tickets 
            GROUP BY COALESCE(category, 'general')
            ORDER BY count DESC
        `;

        const ticketsByPriority = await sql`
            SELECT 
                COALESCE(priority, 'medium') as priority, 
                COUNT(*) as count 
            FROM tickets 
            GROUP BY COALESCE(priority, 'medium')
            ORDER BY count DESC
        `;

        // Time-based analytics
        const recentTickets = await sql`
            SELECT COUNT(*) as count 
            FROM tickets 
            WHERE created_at >= ${startDate.toISOString()}
        `;

        const closedTickets = await sql`
            SELECT COUNT(*) as count 
            FROM tickets 
            WHERE status = 'closed' 
            AND closed_at >= ${startDate.toISOString()}
        `;

        // Resolution time analytics
        const avgResolutionTime = await sql`
            SELECT 
                AVG(resolution_time) as avg_hours,
                MIN(resolution_time) as min_hours,
                MAX(resolution_time) as max_hours
            FROM tickets 
            WHERE resolution_time IS NOT NULL
            AND closed_at >= ${startDate.toISOString()}
        `;

        // Daily ticket trends (last 30 days)
        const dailyTrends = await sql`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as created,
                COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed
            FROM tickets 
            WHERE created_at >= ${startDate.toISOString()}
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `;

        // Monthly analytics for reporting
        const monthlyStats = await sql`
            SELECT 
                DATE_TRUNC('month', created_at) as month,
                COUNT(*) as total_tickets,
                COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_tickets,
                COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority,
                AVG(CASE WHEN resolution_time IS NOT NULL THEN resolution_time END) as avg_resolution_hours
            FROM tickets 
            WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY month DESC
            LIMIT 12
        `;

        // Top categories by volume (for trend analysis)
        const topCategories = await sql`
            SELECT 
                COALESCE(category, 'general') as category,
                COUNT(*) as total_tickets,
                COUNT(CASE WHEN created_at >= ${startDate.toISOString()} THEN 1 END) as recent_tickets,
                AVG(CASE WHEN resolution_time IS NOT NULL THEN resolution_time END) as avg_resolution_hours
            FROM tickets 
            GROUP BY COALESCE(category, 'general')
            ORDER BY total_tickets DESC
            LIMIT 10
        `;

        // Company analytics
        const ticketsByCompany = await sql`
            SELECT 
                c.id,
                c.name as company_name,
                c.domain,
                COUNT(DISTINCT t.id) as ticket_count,
                COUNT(DISTINCT CASE WHEN t.status = 'closed' THEN t.id END) as closed_count,
                COUNT(DISTINCT CASE WHEN t.status IN ('new', 'open') THEN t.id END) as open_count,
                COUNT(DISTINCT CASE WHEN t.created_at >= ${startDate.toISOString()} THEN t.id END) as recent_tickets,
                COUNT(DISTINCT u.id) as user_count,
                AVG(CASE WHEN t.resolution_time IS NOT NULL THEN t.resolution_time END) as avg_resolution_hours
            FROM companies c
            LEFT JOIN tickets t ON t.company_id = c.id
            LEFT JOIN users u ON u.company_id = c.id
            WHERE c.is_active = true
            GROUP BY c.id, c.name, c.domain
            ORDER BY ticket_count DESC
            LIMIT 10
        `;

        // Agent performance (tickets assigned)
        const agentPerformance = await sql`
            SELECT 
                u.id,
                u.full_name,
                u.email,
                COUNT(DISTINCT t.id) as assigned_tickets,
                COUNT(DISTINCT CASE WHEN t.status = 'closed' THEN t.id END) as resolved_tickets,
                COUNT(DISTINCT CASE WHEN t.status IN ('new', 'open') THEN t.id END) as open_tickets,
                AVG(CASE WHEN t.resolution_time IS NOT NULL THEN t.resolution_time END) as avg_resolution_hours
            FROM users u
            LEFT JOIN tickets t ON t.assigned_to = u.id
            WHERE u.role IN ('admin', 'agent') AND u.is_active = true
            GROUP BY u.id, u.full_name, u.email
            HAVING COUNT(DISTINCT t.id) > 0
            ORDER BY assigned_tickets DESC
            LIMIT 10
        `;

        // Performance metrics
        const performanceMetrics = await sql`
            SELECT 
                COUNT(*) as total_tickets,
                COUNT(CASE WHEN status = 'closed' THEN 1 END) as resolved_tickets,
                ROUND((COUNT(CASE WHEN status = 'closed' THEN 1 END)::numeric / NULLIF(COUNT(*)::numeric,0) * 100), 2) as resolution_rate,
                COUNT(CASE WHEN status IN ('new', 'pending') THEN 1 END) as pending_tickets,
                COUNT(CASE WHEN priority = 'high' AND status != 'closed' THEN 1 END) as urgent_open
            FROM tickets
        `;

        const analytics = {
            summary: {
                totalTickets: totalTickets[0].count,
                recentTickets: recentTickets[0].count,
                closedTickets: closedTickets[0].count,
                resolutionRate: performanceMetrics[0].resolution_rate || 0,
                urgentOpen: performanceMetrics[0].urgent_open || 0
            },
            breakdown: {
                byStatus: ticketsByStatus,
                byCategory: ticketsByCategory,
                byPriority: ticketsByPriority
            },
            trends: {
                daily: dailyTrends,
                monthly: monthlyStats
            },
            performance: {
                averageResolution: avgResolutionTime[0]?.avg_hours ? 
                    Math.round(avgResolutionTime[0].avg_hours * 10) / 10 : null,
                fastestResolution: avgResolutionTime[0]?.min_hours || null,
                slowestResolution: avgResolutionTime[0]?.max_hours || null
            },
            insights: {
                topCategories: topCategories,
                timeframe: timeframe
            },
            companies: {
                topByTickets: ticketsByCompany,
                totalCompanies: ticketsByCompany.length
            },
            agents: {
                performance: agentPerformance,
                totalAgents: agentPerformance.length
            },
            generatedAt: new Date().toISOString()
        };

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                analytics: analytics
            })
        };

    } catch (error) {
        console.error('Error generating analytics:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Failed to generate analytics: ' + error.message
            })
        };
    }
};