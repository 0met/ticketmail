const { getDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    try {
        console.log('Recreating tickets table...');
        
        const sql = getDatabase();
        
        // Drop existing table
        await sql`DROP TABLE IF EXISTS tickets`;
        
        // Create table with correct structure
        await sql`
            CREATE TABLE tickets (
                id SERIAL PRIMARY KEY,
                subject TEXT NOT NULL,
                from_email VARCHAR(255) NOT NULL,
                to_email VARCHAR(255),
                body TEXT,
                status VARCHAR(50) DEFAULT 'new',
                message_id VARCHAR(255) UNIQUE,
                date_received TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        
        // Create indexes
        await sql`CREATE INDEX idx_tickets_status ON tickets(status)`;
        await sql`CREATE INDEX idx_tickets_date ON tickets(date_received)`;
        await sql`CREATE INDEX idx_tickets_message_id ON tickets(message_id)`;
        
        // Insert a test ticket
        await sql`
            INSERT INTO tickets (subject, from_email, to_email, body, status, message_id, date_received)
            VALUES ('Test Ticket', 'test@example.com', 'support@example.com', 'This is a test ticket', 'new', 'test-123', NOW())
        `;
        
        // Verify table structure
        const tableInfo = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'tickets' 
            ORDER BY ordinal_position
        `;
        
        // Count tickets
        const count = await sql`SELECT COUNT(*) as count FROM tickets`;
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Tickets table recreated successfully',
                columns: tableInfo,
                ticketCount: count[0].count
            })
        };

    } catch (error) {
        console.error('Error recreating table:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Table recreation failed: ' + error.message
            })
        };
    }
};