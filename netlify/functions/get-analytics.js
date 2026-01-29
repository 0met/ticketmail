const { getDatabase } = require('./lib/database');

const toNumber = (value, fallback = 0) => {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    const numeric = Number(value);
    return Number.isNaN(numeric) ? fallback : numeric;
};

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
        const parsedTimeframe = parseInt(timeframe, 10);
        const timeframeDays = Number.isFinite(parsedTimeframe) ? parsedTimeframe : 30;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeframeDays);
        const startDateISO = startDate.toISOString();

        const monthlyStartDate = new Date();
        monthlyStartDate.setMonth(monthlyStartDate.getMonth() - 12);
        const monthlyStartDateISO = monthlyStartDate.toISOString();

        console.log(`Generating analytics for last ${timeframeDays} days`);

        // Detect optional tables/columns so we can degrade gracefully on different databases
        let isSQLite = false;
        let hasCompaniesTable = false;
        let hasUsersTable = false;
        let hasTicketCompanyColumn = false;
        let hasTicketAssignedColumn = false;
        let hasUserCompanyColumn = false;

        try {
            await sql`SELECT name FROM sqlite_master WHERE type='table' LIMIT 1`;
            isSQLite = true;
        } catch (dialectError) {
            isSQLite = false;
        }

        try {
            let tableNames = [];

            if (isSQLite) {
                const tables = await sql`
                    SELECT name FROM sqlite_master WHERE type='table'
                `;
                tableNames = tables.map(row => row.name);
            } else {
                const tables = await sql`
                    SELECT table_name as name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public'
                `;
                tableNames = tables.map(row => row.name);
            }

            hasCompaniesTable = tableNames.includes('companies');
            hasUsersTable = tableNames.includes('users');

            let ticketColumns;
            if (isSQLite) {
                ticketColumns = await sql`
                    SELECT name FROM pragma_table_info('tickets')
                `;
            } else {
                ticketColumns = await sql`
                    SELECT column_name as name 
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = 'tickets'
                `;
            }
            const ticketColumnNames = ticketColumns.map(col => col.name);
            hasTicketCompanyColumn = ticketColumnNames.includes('company_id');
            hasTicketAssignedColumn = ticketColumnNames.includes('assigned_to');

            if (hasUsersTable) {
                let userColumns;
                if (isSQLite) {
                    userColumns = await sql`
                        SELECT name FROM pragma_table_info('users')
                    `;
                } else {
                    userColumns = await sql`
                        SELECT column_name as name 
                        FROM information_schema.columns 
                        WHERE table_schema = 'public' AND table_name = 'users'
                    `;
                }
                const userColumnNames = userColumns.map(col => col.name);
                hasUserCompanyColumn = userColumnNames.includes('company_id');
            }
        } catch (schemaError) {
            console.warn('Unable to inspect database schema for analytics:', schemaError.message);
        }

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
            WHERE DATE(created_at) >= DATE(${startDateISO})
        `;

        const closedTickets = await sql`
            SELECT COUNT(*) as count 
            FROM tickets 
            WHERE status = 'closed' 
            AND DATE(closed_at) >= DATE(${startDateISO})
        `;

        // Resolution time analytics
        const avgResolutionTime = await sql`
            SELECT 
                AVG(resolution_time) as avg_hours,
                MIN(resolution_time) as min_hours,
                MAX(resolution_time) as max_hours
            FROM tickets 
            WHERE resolution_time IS NOT NULL
            AND DATE(closed_at) >= DATE(${startDateISO})
        `;

        // Daily ticket trends (last 30 days)
        const dailyTrends = await sql`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as created,
                SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
            FROM tickets 
            WHERE DATE(created_at) >= DATE(${startDateISO})
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        `;

        // Monthly analytics for reporting
        let monthlyStats = [];
        if (isSQLite) {
            monthlyStats = await sql`
                SELECT 
                    strftime('%Y-%m-01', created_at) as month,
                    COUNT(*) as total_tickets,
                    SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_tickets,
                    SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_priority,
                    AVG(CASE WHEN resolution_time IS NOT NULL THEN resolution_time END) as avg_resolution_hours
                FROM tickets 
                WHERE DATE(created_at) >= DATE(${monthlyStartDateISO})
                GROUP BY strftime('%Y-%m', created_at)
                ORDER BY month DESC
                LIMIT 12
            `;
        } else {
            monthlyStats = await sql`
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
        }

        // Top categories by volume (for trend analysis)
        const topCategories = await sql`
            SELECT 
                COALESCE(category, 'general') as category,
                COUNT(*) as total_tickets,
                SUM(CASE WHEN DATE(created_at) >= DATE(${startDateISO}) THEN 1 ELSE 0 END) as recent_tickets,
                AVG(CASE WHEN resolution_time IS NOT NULL THEN resolution_time END) as avg_resolution_hours
            FROM tickets 
            GROUP BY COALESCE(category, 'general')
            ORDER BY total_tickets DESC
            LIMIT 10
        `;

        // Company analytics
        // Company analytics (only when schema supports it)
        let ticketsByCompany = [];
        if (hasCompaniesTable && hasTicketCompanyColumn) {
            const companyTicketStats = await sql`
                SELECT 
                    company_id,
                    COUNT(*) as ticket_count,
                    SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_count,
                    SUM(CASE WHEN status IN ('new', 'open', 'pending') THEN 1 ELSE 0 END) as open_count,
                    SUM(CASE WHEN DATE(created_at) >= DATE(${startDateISO}) THEN 1 ELSE 0 END) as recent_tickets,
                    AVG(CASE WHEN resolution_time IS NOT NULL THEN resolution_time END) as avg_resolution_hours
                FROM tickets 
                WHERE company_id IS NOT NULL
                GROUP BY company_id
                ORDER BY ticket_count DESC
                LIMIT 10
            `;

            if (companyTicketStats.length) {
                let userCountsByCompany = {};
                if (hasUsersTable && hasUserCompanyColumn) {
                    const userCounts = await sql`
                        SELECT company_id, COUNT(*) as count
                        FROM users
                        WHERE company_id IS NOT NULL AND COALESCE(is_active, 1) = 1
                        GROUP BY company_id
                    `;
                    userCounts.forEach(row => {
                        userCountsByCompany[row.company_id] = toNumber(row.count);
                    });
                }

                const companyDetails = await Promise.all(companyTicketStats.map(async stats => {
                    const companyInfo = await sql`
                        SELECT id, name as company_name, domain
                        FROM companies
                        WHERE id = ${stats.company_id} AND COALESCE(is_active, 1) = 1
                        LIMIT 1
                    `;

                    if (!companyInfo.length) {
                        return null;
                    }

                    return {
                        id: companyInfo[0].id,
                        company_name: companyInfo[0].company_name,
                        domain: companyInfo[0].domain,
                        ticket_count: toNumber(stats.ticket_count),
                        closed_count: toNumber(stats.closed_count),
                        open_count: toNumber(stats.open_count),
                        recent_tickets: toNumber(stats.recent_tickets),
                        avg_resolution_hours: stats.avg_resolution_hours === null || stats.avg_resolution_hours === undefined
                            ? null
                            : Math.round(Number(stats.avg_resolution_hours) * 10) / 10,
                        user_count: userCountsByCompany[stats.company_id] || 0
                    };
                }));

                ticketsByCompany = companyDetails.filter(Boolean);
            }
        }

        // Agent performance (tickets assigned) when schema supports it
        let agentPerformance = [];
        if (hasUsersTable && hasTicketAssignedColumn) {
            agentPerformance = await sql`
                SELECT 
                    u.id,
                    u.full_name,
                    u.email,
                    stats.assigned_tickets,
                    stats.resolved_tickets,
                    stats.open_tickets,
                    stats.avg_resolution_hours
                FROM users u
                JOIN (
                    SELECT 
                        assigned_to as user_id,
                        COUNT(*) as assigned_tickets,
                        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as resolved_tickets,
                        SUM(CASE WHEN status IN ('new', 'open', 'pending') THEN 1 ELSE 0 END) as open_tickets,
                        AVG(CASE WHEN resolution_time IS NOT NULL THEN resolution_time END) as avg_resolution_hours
                    FROM tickets
                    WHERE assigned_to IS NOT NULL
                    GROUP BY assigned_to
                ) stats ON stats.user_id = u.id
                WHERE u.role IN ('admin', 'agent') AND COALESCE(u.is_active, 1) = 1
                ORDER BY stats.assigned_tickets DESC
                LIMIT 10
            `;
        }

        // Performance metrics
        const performanceCounts = await sql`
            SELECT 
                COUNT(*) as total_tickets,
                SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as resolved_tickets,
                SUM(CASE WHEN status IN ('new', 'pending') THEN 1 ELSE 0 END) as pending_tickets,
                SUM(CASE WHEN priority = 'high' AND status != 'closed' THEN 1 ELSE 0 END) as urgent_open
            FROM tickets
        `;

        const totalTicketsCount = toNumber(performanceCounts[0]?.total_tickets);
        const resolvedTicketsCount = toNumber(performanceCounts[0]?.resolved_tickets);
        const resolutionRate = totalTicketsCount > 0
            ? Math.round((resolvedTicketsCount / totalTicketsCount) * 1000) / 10
            : 0;

        const normalizedAgentPerformance = agentPerformance.map(agent => ({
            ...agent,
            assigned_tickets: toNumber(agent.assigned_tickets),
            resolved_tickets: toNumber(agent.resolved_tickets),
            open_tickets: toNumber(agent.open_tickets),
            avg_resolution_hours: agent.avg_resolution_hours === null || agent.avg_resolution_hours === undefined
                ? null
                : Math.round(Number(agent.avg_resolution_hours) * 10) / 10
        }));

        const analytics = {
            summary: {
                totalTickets: toNumber(totalTickets[0]?.count),
                recentTickets: toNumber(recentTickets[0]?.count),
                closedTickets: toNumber(closedTickets[0]?.count),
                resolutionRate,
                urgentOpen: toNumber(performanceCounts[0]?.urgent_open)
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
                averageResolution: avgResolutionTime[0]?.avg_hours !== null && avgResolutionTime[0]?.avg_hours !== undefined ? 
                    Math.round(Number(avgResolutionTime[0].avg_hours) * 10) / 10 : null,
                fastestResolution: avgResolutionTime[0]?.min_hours !== null && avgResolutionTime[0]?.min_hours !== undefined ? Number(avgResolutionTime[0].min_hours) : null,
                slowestResolution: avgResolutionTime[0]?.max_hours !== null && avgResolutionTime[0]?.max_hours !== undefined ? Number(avgResolutionTime[0].max_hours) : null
            },
            insights: {
                topCategories: topCategories,
                timeframe: timeframeDays
            },
            companies: {
                topByTickets: ticketsByCompany,
                totalCompanies: ticketsByCompany.length
            },
            agents: {
                performance: normalizedAgentPerformance,
                totalAgents: normalizedAgentPerformance.length
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