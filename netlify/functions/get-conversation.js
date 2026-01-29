const { getDatabase } = require('./lib/database');

function isMissingRelation(error) {
    const msg = (error && error.message ? String(error.message) : '').toLowerCase();
    return msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache');
}

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

        const supabase = getDatabase();

        const { data, error } = await supabase
            .from('ticket_conversations')
            .select('message_type, from_email, to_email, subject, message, created_at')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (error) {
            if (isMissingRelation(error)) {
                return {
                    statusCode: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: true,
                        conversation: [],
                        count: 0,
                        needsSetup: true
                    })
                };
            }
            throw error;
        }

        const conversation = (data || []).map((row) => ({
            type: row.message_type,
            from: row.from_email,
            to: row.to_email,
            subject: row.subject,
            message: row.message,
            date: row.created_at
        }));

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