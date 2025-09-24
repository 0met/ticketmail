const { getDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

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

    try {
        const sql = getDatabase();
        
        // Check what columns actually exist in the tickets table
        const columns = await sql`
            SELECT column_name, data_type
            FROM information_schema.columns 
            WHERE table_name = 'tickets' 
            ORDER BY ordinal_position
        `;
        
        // Get sample data to see the structure
        const sampleTickets = await sql`
            SELECT * FROM tickets LIMIT 3
        `;
        
        // Count total tickets
        const count = await sql`
            SELECT COUNT(*) as total FROM tickets
        `;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                columns: columns,
                sampleData: sampleTickets,
                totalTickets: count[0].total,
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Error inspecting database:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};