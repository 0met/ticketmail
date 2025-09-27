const { getDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    try {
        const sql = getDatabase();

        console.log('Testing database schema and customer data...');

        // Check table schema
        const columns = await sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'tickets' 
            ORDER BY ordinal_position
        `;

        console.log('Tickets table columns:', columns);

        // Check if customer columns exist
        const customerColumns = columns.filter(c => 
            c.column_name.startsWith('customer_')
        );

        // Test query to see what data we get
        const testTickets = await sql`
            SELECT id, subject, customer_name, customer_id, customer_phone, customer_email
            FROM tickets 
            WHERE customer_name IS NOT NULL OR customer_id IS NOT NULL
            LIMIT 5
        `;

        console.log('Test tickets with customer data:', testTickets);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Database schema test completed',
                columns: columns.map(c => `${c.column_name} (${c.data_type})`),
                customerColumns: customerColumns.map(c => c.column_name),
                testTickets: testTickets
            })
        };

    } catch (error) {
        console.error('Database schema test failed:', error);
        
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