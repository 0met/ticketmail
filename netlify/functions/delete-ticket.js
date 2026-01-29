const { getDatabase } = require('./lib/database');

function isMissingRelation(error) {
    const msg = (error && error.message ? String(error.message) : '').toLowerCase();
    return msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache');
}

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

        const supabase = getDatabase();

        // First, check if ticket exists
        const { data: existingTicket, error: selectError } = await supabase
            .from('tickets')
            .select('id, subject, from_email')
            .eq('id', Number(ticketId))
            .single();

        if (selectError || !existingTicket) {
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

        const ticket = existingTicket;

        // Delete related conversation history first (optional)
        try {
            const { error: convoError } = await supabase
                .from('ticket_conversations')
                .delete()
                .eq('ticket_id', String(ticketId));
            if (convoError && !isMissingRelation(convoError)) {
                console.warn('Could not delete conversation history:', convoError.message);
            }
        } catch (error) {
            console.warn('Conversation delete error:', error.message);
        }

        // Delete the ticket
        const { error: deleteError } = await supabase
            .from('tickets')
            .delete()
            .eq('id', Number(ticketId));

        if (deleteError) {
            throw deleteError;
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