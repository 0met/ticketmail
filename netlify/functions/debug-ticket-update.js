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
        const { ticketId } = JSON.parse(event.body);

        console.log(`Debug: Looking up ticket ${ticketId}`);

        const sql = getDatabase();
        
        // First, let's check if the ticket exists and what its current status is
        const currentTicket = await sql`
            SELECT id, status, subject, updated_at
            FROM tickets 
            WHERE id = ${ticketId}
        `;

        console.log('Current ticket data:', currentTicket);

        // Let's also check the table structure
        const tableInfo = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'tickets' 
            AND column_name IN ('id', 'status', 'updated_at')
            ORDER BY ordinal_position
        `;

        console.log('Table structure:', tableInfo);

        // Now try to update the status
        const updateResult = await sql`
            UPDATE tickets 
            SET status = 'debug-test', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ${ticketId}
        `;

        console.log('Update result:', updateResult);

        // Check if the update worked
        const updatedTicket = await sql`
            SELECT id, status, subject, updated_at
            FROM tickets 
            WHERE id = ${ticketId}
        `;

        console.log('After update:', updatedTicket);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                debug: {
                    ticketId: ticketId,
                    currentTicket: currentTicket,
                    tableInfo: tableInfo,
                    updateResult: updateResult,
                    updatedTicket: updatedTicket
                }
            })
        };

    } catch (error) {
        console.error('Debug error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: error.message,
                stack: error.stack
            })
        };
    }
};