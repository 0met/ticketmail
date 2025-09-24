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

        // First, check what columns exist in the tickets table
        const tableInfo = await sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'tickets'
        `;
        
        const columnNames = tableInfo.map(row => row.column_name);
        console.log('Available columns:', columnNames);

        // Basic statistics that should work with any ticket table
        const totalTickets = await sql`
            SELECT COUNT(*) as count FROM tickets
        `;

        const ticketsByStatus = await sql`
            SELECT 
                COALESCE(status, 'new') as status, 
                COUNT(*) as count 
            FROM tickets 
            GROUP BY COALESCE(status, 'new')
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
                COALESCE(priority, 'normal') as priority, 
                COUNT(*) as count 
            FROM tickets 
            GROUP BY COALESCE(priority, 'normal')
            ORDER BY count DESC
        `;

        // Time-based analytics using created_at (should always exist)
        const recentTickets = await sql`
            SELECT COUNT(*) as count 
            FROM tickets 
            WHERE created_at >= ${startDate.toISOString()}
        `;

        // Count resolved/closed tickets (using status, not closed_at)
        const resolvedTickets = await sql`
            SELECT COUNT(*) as count 
            FROM tickets 
            WHERE status IN ('resolved', 'closed')
            AND created_at >= ${startDate.toISOString()}
        `;

        // Daily ticket trends using available columns
        const dailyTrends = await sql`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as created,
                COUNT(CASE WHEN status IN ('resolved', 'closed') THEN 1 END) as resolved
            FROM tickets 
            WHERE created_at >= ${startDate.toISOString()}
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `;

        // Top categories with basic performance metrics
        const topCategories = await sql`
            SELECT 
                COALESCE(category, 'general') as category,
                COUNT(*) as total_tickets,
                COUNT(CASE WHEN created_at >= ${startDate.toISOString()} THEN 1 END) as recent_tickets,
                COUNT(CASE WHEN status IN ('resolved', 'closed') THEN 1 END) as resolved_tickets
            FROM tickets 
            GROUP BY COALESCE(category, 'general')
            ORDER BY total_tickets DESC
            LIMIT 10
        `;

        // Performance metrics
        const totalCount = parseInt(totalTickets[0].count);
        const resolvedCount = parseInt(resolvedTickets[0].count);
        const resolutionRate = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

        // Count urgent open tickets
        const urgentOpen = await sql`
            SELECT COUNT(*) as count 
            FROM tickets 
            WHERE priority IN ('urgent', 'high') 
            AND status NOT IN ('resolved', 'closed')
        `;

        const analytics = {
            summary: {
                totalTickets: totalCount,
                recentTickets: parseInt(recentTickets[0].count),
                resolutionRate: resolutionRate,
                urgentOpen: parseInt(urgentOpen[0].count)
            },
            breakdown: {
                byStatus: ticketsByStatus,
                byCategory: ticketsByCategory,
                byPriority: ticketsByPriority
            },
            trends: {
                monthly: dailyTrends // Using daily trends for now
            },
            performance: {
                averageResolution: 24 // Default placeholder since resolution_time may not exist
            },
            insights: {
                topCategories: topCategories.map(cat => ({
                    category: cat.category,
                    count: parseInt(cat.total_tickets),
                    resolutionRate: cat.total_tickets > 0 ? 
                        Math.round((cat.resolved_tickets / cat.total_tickets) * 100) : 0,
                    averageTime: 24 // Placeholder
                }))
            }
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