const { getDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed. Use POST.'
            })
        };
    }

    try {
        const sql = getDatabase();
        
        console.log('Adding customer information columns to tickets table...');
        
        // Add customer information columns if they don't exist
        const alterQueries = [
            'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_name TEXT',
            'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_id TEXT', 
            'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_phone TEXT',
            'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_email TEXT'
        ];
        
        for (const query of alterQueries) {
            try {
                await sql.unsafe(query);
                console.log('Executed:', query);
            } catch (error) {
                if (error.message.includes('already exists')) {
                    console.log('Column already exists, skipping:', query);
                } else {
                    console.error('Error executing query:', query, error);
                    throw error;
                }
            }
        }
        
        // Verify the schema
        const tableInfo = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'tickets'
            ORDER BY ordinal_position
        `;
        
        console.log('Current table schema:', tableInfo);
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Customer information columns added successfully',
                schema: tableInfo
            })
        };
        
    } catch (error) {
        console.error('Error updating schema:', error);
        
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