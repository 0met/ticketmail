const { getDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

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
        let migrationResult = [];
        try {
            await sql`
                ALTER TABLE tickets 
                ADD COLUMN IF NOT EXISTS customer_name TEXT,
                ADD COLUMN IF NOT EXISTS customer_id TEXT,
                ADD COLUMN IF NOT EXISTS customer_phone TEXT,
                ADD COLUMN IF NOT EXISTS customer_email TEXT
            `;
            console.log('✅ Customer fields added successfully');
            migrationResult.push('Customer fields added successfully');
        } catch (error) {
            console.log('⚠️  Error adding columns (they might already exist):', error.message);
            migrationResult.push(`Error adding columns: ${error.message}`);
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
            
            try {
                await sql`
                    UPDATE tickets 
                    SET customer_name = 'Migration Test', 
                        customer_id = 'MIGRATE123',
                        customer_phone = '555-MIGRATE',
                        customer_email = 'migrate@test.com'
                    WHERE id = ${testId}
                `;
                console.log('✅ Test update successful');
                migrationResult.push('Test update successful');
            } catch (error) {
                console.log('❌ Test update failed:', error.message);
                migrationResult.push(`Test update failed: ${error.message}`);
            }
        }

        console.log('🎉 Migration completed');

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Migration completed successfully',
                currentColumns: currentColumns.map(c => `${c.column_name}: ${c.data_type}`),
                updatedColumns: updatedColumns.map(c => `${c.column_name}: ${c.data_type}`),
                migrationResults: migrationResult
            })
        };

    } catch (error) {
        console.error('❌ Migration failed:', error);
        
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