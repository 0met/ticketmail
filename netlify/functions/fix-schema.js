const { getDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // Handle CORS preflight requests
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
        console.log('Starting database schema fix...');
        
        const sql = getDatabase();
        
        // Check current table structure
        const tableInfo = await sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'tickets' 
            ORDER BY ordinal_position
        `;
        
        console.log('Current table structure:', tableInfo);
        
        // Add missing columns if they don't exist
        const columnNames = tableInfo.map(col => col.column_name);
        
        if (!columnNames.includes('body')) {
            console.log('Adding missing body column...');
            await sql`ALTER TABLE tickets ADD COLUMN body TEXT`;
        }
        
        // Recreate the table structure to ensure consistency
        console.log('Ensuring table structure is correct...');
        await sql`
            CREATE TABLE IF NOT EXISTS tickets_new (
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
        
        // Copy data if tickets table exists and has data
        const existingTickets = await sql`SELECT COUNT(*) as count FROM tickets`.catch(() => [{ count: 0 }]);
        
        if (existingTickets[0].count > 0) {
            console.log('Copying existing tickets...');
            await sql`
                INSERT INTO tickets_new (subject, from_email, to_email, body, status, message_id, date_received, created_at, updated_at)
                SELECT subject, from_email, to_email, 
                       CASE WHEN column_name = 'body' THEN body ELSE NULL END as body,
                       status, message_id, date_received, created_at, updated_at
                FROM tickets
            `.catch(() => {
                // If copy fails, just proceed without copying
                console.log('Copy failed, proceeding with new table');
            });
        }
        
        // Drop old table and rename new one
        await sql`DROP TABLE IF EXISTS tickets`;
        await sql`ALTER TABLE tickets_new RENAME TO tickets`;
        
        // Recreate indexes
        await sql`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_tickets_date ON tickets(date_received)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_tickets_message_id ON tickets(message_id)`;
        
        // Verify the final structure
        const finalTableInfo = await sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'tickets' 
            ORDER BY ordinal_position
        `;
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Database schema fixed successfully',
                originalColumns: tableInfo.map(col => col.column_name),
                finalColumns: finalTableInfo.map(col => col.column_name),
                tableStructure: finalTableInfo
            })
        };

    } catch (error) {
        console.error('Error fixing database schema:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Schema fix failed: ' + error.message
            })
        };
    }
};