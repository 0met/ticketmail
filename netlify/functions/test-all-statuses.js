const { getDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

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
        
        // Get a ticket to test with
        const tickets = await sql`SELECT id, status FROM tickets LIMIT 1`;
        const testTicketId = tickets[0].id;
        const originalStatus = tickets[0].status;
        
        console.log(`Testing different status values for ticket ${testTicketId}, original status: ${originalStatus}`);
        
        // Test different status values to see which ones work
        const statusesToTest = ['new', 'open', 'pending', 'closed', 'in_progress', 'resolved', 'cancelled', 'waiting'];
        const results = [];
        
        for (const status of statusesToTest) {
            try {
                await sql`
                    UPDATE tickets 
                    SET status = ${status}, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ${testTicketId}
                `;
                results.push({ status: status, success: true, error: null });
                console.log(`✓ ${status} worked`);
            } catch (error) {
                results.push({ status: status, success: false, error: error.message });
                console.log(`✗ ${status} failed: ${error.message}`);
            }
        }
        
        // Restore original status
        try {
            await sql`
                UPDATE tickets 
                SET status = ${originalStatus}, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ${testTicketId}
            `;
        } catch (error) {
            console.log(`Warning: Could not restore original status ${originalStatus}`);
        }
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                testTicketId: testTicketId,
                originalStatus: originalStatus,
                testResults: results,
                validStatuses: results.filter(r => r.success).map(r => r.status),
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Error in status test:', error);
        
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