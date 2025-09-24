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
        
        // Get a ticket ID from the sample data
        const tickets = await sql`SELECT id, status FROM tickets LIMIT 1`;
        
        if (tickets.length === 0) {
            throw new Error('No tickets found to test with');
        }
        
        const testTicketId = tickets[0].id;
        const currentStatus = tickets[0].status;
        
        console.log(`Testing update of ticket ${testTicketId} from status ${currentStatus}`);
        
        // Try to update to 'pending'
        try {
            await sql`
                UPDATE tickets 
                SET status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ${testTicketId}
            `;
            
            // Check if it worked
            const updatedTicket = await sql`SELECT status FROM tickets WHERE id = ${testTicketId}`;
            
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    message: 'Status update successful',
                    testTicketId: testTicketId,
                    oldStatus: currentStatus,
                    newStatus: updatedTicket[0].status,
                    timestamp: new Date().toISOString()
                })
            };
            
        } catch (updateError) {
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: updateError.message,
                    testTicketId: testTicketId,
                    currentStatus: currentStatus,
                    timestamp: new Date().toISOString()
                })
            };
        }

    } catch (error) {
        console.error('Error in test update:', error);
        
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