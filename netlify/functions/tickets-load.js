const { getTickets } = require('./lib/database');

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
        // Get query parameters
        const params = event.queryStringParameters || {};
        const limit = parseInt(params.limit) || 100;
        const status = params.status; // Optional status filter

        // Validate limit
        if (limit < 1 || limit > 1000) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Limit must be between 1 and 1000'
                })
            };
        }

        // Load tickets from database
        const tickets = await getTickets(limit);

        // Filter by status if provided
        let filteredTickets = tickets;
        if (status) {
            const validStatuses = ['new', 'open', 'pending', 'closed'];
            if (!validStatuses.includes(status)) {
                return {
                    statusCode: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
                    })
                };
            }
            filteredTickets = tickets.filter(ticket => ticket.status === status);
        }

        // Calculate statistics
        const stats = {
            total: tickets.length,
            new: tickets.filter(t => t.status === 'new').length,
            open: tickets.filter(t => t.status === 'open').length,
            pending: tickets.filter(t => t.status === 'pending').length,
            closed: tickets.filter(t => t.status === 'closed').length
        };

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                tickets: filteredTickets,
                stats: stats,
                count: filteredTickets.length
            })
        };

    } catch (error) {
        console.error('Error in tickets-load function:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error: ' + error.message
            })
        };
    }
};