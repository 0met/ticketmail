const { getTickets } = require('./lib/tickets');

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
        // Parse query parameters for filters
        const filters = {};
        const queryParams = event.queryStringParameters || {};

        if (queryParams.status) filters.status = queryParams.status;
        if (queryParams.priority) filters.priority = queryParams.priority;
        if (queryParams.assigned_to) filters.assigned_to = parseInt(queryParams.assigned_to);
        if (queryParams.created_by) filters.created_by = parseInt(queryParams.created_by);
        if (queryParams.limit) filters.limit = parseInt(queryParams.limit);

        const result = await getTickets(filters);

        if (result.success) {
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    success: true,
                    tickets: result.tickets,
                    count: result.tickets.length
                })
            };
        } else {
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: result.error })
            };
        }
    } catch (error) {
        console.error('Error getting tickets:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Internal server error' })
        };
    }
};