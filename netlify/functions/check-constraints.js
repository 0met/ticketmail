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
        
        // Check for constraints on the tickets table
        const constraints = await sql`
            SELECT conname, consrc
            FROM pg_constraint
            WHERE conrelid = (
                SELECT oid 
                FROM pg_class 
                WHERE relname = 'tickets'
            )
            AND contype = 'c'
        `;
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                constraints: constraints,
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Error checking constraints:', error);
        
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