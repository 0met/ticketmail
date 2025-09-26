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
        console.log('Checking and adding customer columns...');
        
        // Try to add each column individually with error handling
        const columnDefinitions = [
            { name: 'customer_name', type: 'VARCHAR(255)' },
            { name: 'customer_id', type: 'VARCHAR(100)' }, 
            { name: 'customer_phone', type: 'VARCHAR(20)' },
            { name: 'customer_email', type: 'VARCHAR(255)' }
        ];
        
        const results = [];
        
        for (const column of columnDefinitions) {
            try {
                console.log(`Adding column ${column.name}...`);
                await sql`ALTER TABLE tickets ADD COLUMN ${sql(column.name)} ${sql.unsafe(column.type)}`;
                results.push(`${column.name}: added successfully`);
                console.log(`✅ Added ${column.name}`);
            } catch (error) {
                if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
                    results.push(`${column.name}: already exists`);
                    console.log(`ℹ️ ${column.name} already exists`);
                } else {
                    console.error(`❌ Error adding ${column.name}:`, error);
                    results.push(`${column.name}: error - ${error.message}`);
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
                message: 'Customer information columns migration completed',
                results: results,
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