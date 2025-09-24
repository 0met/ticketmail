const { getDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'DELETE, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    // Allow both DELETE and POST methods
    if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed. Use DELETE or POST.'
            })
        };
    }

    try {
        let ticketId;

        // Get ticket ID from URL path or request body
        if (event.httpMethod === 'DELETE') {
            // Extract ticket ID from path (e.g., /delete-ticket/123)
            const pathParts = event.path.split('/');
            ticketId = pathParts[pathParts.length - 1];
        } else {
            // POST method - get from request body
            const body = JSON.parse(event.body || '{}');
            ticketId = body.ticketId;
        }

        // Validate ticket ID
        if (!ticketId || isNaN(ticketId)) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid or missing ticket ID'
                })
            };
        }

        console.log(`Attempting to delete ticket ${ticketId}`);

        const sql = getDatabase();

        // First, check if ticket exists
        const existingTicket = await sql`
            SELECT id, subject, from_email 
            FROM tickets 
            WHERE id = ${ticketId}
        `;

        if (existingTicket.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Ticket not found'
                })
            };
        }

        const ticket = existingTicket[0];

        // Delete related conversation history first (if the table exists)
        try {
            await sql`
                DELETE FROM ticket_conversations 
                WHERE ticket_id = ${ticketId}
            `;
            console.log(`Deleted conversation history for ticket ${ticketId}`);
        } catch (error) {
            console.log('No conversation history to delete or table does not exist');
        }

        // Delete the ticket
        const deleteResult = await sql`
            DELETE FROM tickets 
            WHERE id = ${ticketId}
        `;

        if (deleteResult.count === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Ticket not found or already deleted'
                })
            };
        }

        console.log(`Successfully deleted ticket ${ticketId}`);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Ticket deleted successfully',
                deletedTicket: {
                    id: ticket.id,
                    subject: ticket.subject,
                    from_email: ticket.from_email
                }
            })
        };

    } catch (error) {
        console.error('Error deleting ticket:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Failed to delete ticket: ' + error.message
            })
        };
    }
};