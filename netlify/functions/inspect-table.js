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
        
        // Get actual table structure
        const columns = await sql`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'tickets' 
            ORDER BY ordinal_position
        `;
        
        // Check if table has any data
        const rowCount = await sql`SELECT COUNT(*) as count FROM tickets`;
        
        // Get sample data if any exists
        let sampleData = [];
        if (rowCount[0].count > 0) {
            sampleData = await sql`SELECT * FROM tickets LIMIT 3`;
        }
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                tableStructure: {
                    columns: columns,
                    rowCount: rowCount[0].count,
                    sampleData: sampleData
                },
                columnNames: columns.map(col => col.column_name)
            })
        };

    } catch (error) {
        console.error('Error inspecting table:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Table inspection failed: ' + error.message
            })
        };
    }
};