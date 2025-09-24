const { getDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    try {
        const ticketId = event.queryStringParameters?.ticketId;

        if (!ticketId) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Missing ticketId parameter'
                })
            };
        }

        console.log(`Getting conversation for ticket ${ticketId}`);

        const sql = getDatabase();

        // Create conversation table if it doesn't exist
        await sql`
            CREATE TABLE IF NOT EXISTS ticket_conversations (
                id SERIAL PRIMARY KEY,
                ticket_id VARCHAR(255) NOT NULL,
                message_type VARCHAR(20) NOT NULL, -- 'inbound', 'outbound', 'system'
                from_email VARCHAR(255),
                to_email VARCHAR(255),
                subject VARCHAR(500),
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // Create index for ticket conversations
        await sql`
            CREATE INDEX IF NOT EXISTS idx_ticket_conversations_ticket_id 
            ON ticket_conversations(ticket_id)
        `;

        // Get conversation history
        const conversation = await sql`
            SELECT message_type as type, from_email as from, to_email as to, 
                   subject, message, created_at as date
            FROM ticket_conversations 
            WHERE ticket_id = ${ticketId}
            ORDER BY created_at ASC
        `;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                conversation: conversation,
                count: conversation.length
            })
        };

    } catch (error) {
        console.error('Error getting conversation:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Failed to get conversation: ' + error.message
            })
        };
    }
};