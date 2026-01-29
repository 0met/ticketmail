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
        const supabase = getDatabase();

        // Get query parameters
        const params = event.queryStringParameters || {};
        const timeframe = params.timeframe || '30'; // days
        const parsedTimeframe = parseInt(timeframe, 10);
        const timeframeDays = Number.isFinite(parsedTimeframe) ? parsedTimeframe : 30;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeframeDays);

        console.log(`Generating analytics for last ${timeframeDays} days from ${startDate.toISOString()}`);

        // Get all tickets
        const { data: allTickets, error: ticketsError } = await supabase
            .from('tickets')
            .select('*');

        if (ticketsError) throw ticketsError;

        const totalTicketsCount = allTickets.length;
        const resolvedTickets = allTickets.filter(t => t.status === 'closed');
        const resolvedTicketsCount = resolvedTickets.length;
        const urgentOpenCount = allTickets.filter(t => t.priority === 'high' && t.status !== 'closed').length;
        
        // Calculate resolution rate
        const resolutionRate = totalTicketsCount > 0
            ? Math.round((resolvedTicketsCount / totalTicketsCount) * 1000) / 10
            : 0;

        // Calculate average resolution time
        let avgResolutionHours = null;
        const ticketsWithResolution = resolvedTickets.filter(t => t.resolution_time != null);
        if (ticketsWithResolution.length > 0) {
            const totalHours = ticketsWithResolution.reduce((sum, t) => sum + (t.resolution_time || 0), 0);
            avgResolutionHours = Math.round((totalHours / ticketsWithResolution.length) * 10) / 10;
        }

        // Filter recent tickets
        const recentTickets = allTickets.filter(t => new Date(t.created_at) >= startDate);
        const recentTicketsCount = recentTickets.length;

        // Breakdown by status
        const byStatus = {};
        allTickets.forEach(t => {
            const status = t.status || 'unknown';
            byStatus[status] = (byStatus[status] || 0) + 1;
        });
        const ticketsByStatus = Object.entries(byStatus).map(([status, count]) => ({ status, count }));

        // Breakdown by category
        const byCategory = {};
        allTickets.forEach(t => {
            const category = t.category || 'general';
            byCategory[category] = (byCategory[category] || 0) + 1;
        });
        const ticketsByCategory = Object.entries(byCategory)
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count);

        // Breakdown by priority
        const byPriority = {};
        allTickets.forEach(t => {
            const priority = t.priority || 'medium';
            byPriority[priority] = (byPriority[priority] || 0) + 1;
        });
        const ticketsByPriority = Object.entries(byPriority)
            .map(([priority, count]) => ({ priority, count }))
            .sort((a, b) => b.count - a.count);

        // Top categories with resolution time
        const topCategories = Object.entries(byCategory).map(([category, total_tickets]) => {
            const categoryTickets = allTickets.filter(t => (t.category || 'general') === category);
            const recentCategoryTickets = recentTickets.filter(t => (t.category || 'general') === category);
            const resolvedCategoryTickets = categoryTickets.filter(t => t.resolution_time != null);
            
            let avg_resolution_hours = null;
            if (resolvedCategoryTickets.length > 0) {
                const totalHours = resolvedCategoryTickets.reduce((sum, t) => sum + (t.resolution_time || 0), 0);
                avg_resolution_hours = Math.round((totalHours / resolvedCategoryTickets.length) * 10) / 10;
            }

            return {
                category,
                total_tickets,
                recent_tickets: recentCategoryTickets.length,
                avg_resolution_hours
            };
        }).sort((a, b) => b.total_tickets - a.total_tickets).slice(0, 10);

        const analytics = {
            summary: {
                totalTickets: totalTicketsCount,
                recentTickets: recentTicketsCount,
                closedTickets: resolvedTicketsCount,
                resolutionRate,
                urgentOpen: urgentOpenCount
            },
            breakdown: {
                byStatus: ticketsByStatus,
                byCategory: ticketsByCategory,
                byPriority: ticketsByPriority
            },
            trends: {
                daily: [],
                monthly: []
            },
            performance: {
                averageResolution: avgResolutionHours,
                fastestResolution: null,
                slowestResolution: null
            },
            insights: {
                topCategories: topCategories,
                timeframe: timeframeDays
            },
            companies: {
                topByTickets: [],
                totalCompanies: 0
            },
            agents: {
                performance: [],
                totalAgents: 0
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
