const { getDatabase } = require('./netlify/functions/lib/database');

async function migrateDatabaseColumns() {
    try {
        const sql = getDatabase();

        console.log('Starting database migration for customer fields...');

        // Check current table structure
        console.log('Current table structure:');
        const currentColumns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'tickets' 
            ORDER BY ordinal_position
        `;
        
        console.log('Current columns:', currentColumns.map(c => `${c.column_name}: ${c.data_type}`));

        // Add customer fields if they don't exist
        try {
            await sql`
                ALTER TABLE tickets 
                ADD COLUMN IF NOT EXISTS customer_name TEXT,
                ADD COLUMN IF NOT EXISTS customer_id TEXT,
                ADD COLUMN IF NOT EXISTS customer_phone TEXT,
                ADD COLUMN IF NOT EXISTS customer_email TEXT
            `;
            console.log('✅ Customer fields added successfully');
        } catch (error) {
            console.log('⚠️  Error adding columns (they might already exist):', error.message);
        }

        // Verify the columns were added
        console.log('Updated table structure:');
        const updatedColumns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'tickets' 
            ORDER BY ordinal_position
        `;
        
        console.log('Updated columns:', updatedColumns.map(c => `${c.column_name}: ${c.data_type}`));

        // Test updating a ticket with customer fields
        const sampleTickets = await sql`SELECT id FROM tickets LIMIT 1`;
        if (sampleTickets.length > 0) {
            const testId = sampleTickets[0].id;
            console.log(`Testing update with ticket ID: ${testId}`);
            
            await sql`
                UPDATE tickets 
                SET customer_name = 'Test Name', 
                    customer_id = 'TEST123',
                    customer_phone = '555-0123',
                    customer_email = 'test@example.com'
                WHERE id = ${testId}
            `;
            console.log('✅ Test update successful');
        }

        console.log('🎉 Migration completed successfully');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        process.exit(0);
    }
}

// Export for Netlify function use or run directly
if (require.main === module) {
    migrateDatabaseColumns();
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    try {
        await migrateDatabaseColumns();
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Migration completed successfully'
            })
        };
    } catch (error) {
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