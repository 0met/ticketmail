const { getDatabase, getSqlDatabase } = require('./lib/database');

function isMissingRelation(error) {
    const msg = (error && error.message ? String(error.message) : '').toLowerCase();
    return msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache');
}

function isSchemaCache(error) {
    const msg = (error && error.message ? String(error.message) : '').toLowerCase();
    return msg.includes('schema cache') || msg.includes('could not find the table');
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
                const likelySchemaCache = isSchemaCache(error);

                if (likelySchemaCache) {
                    // Fallback to direct SQL read via SUPABASE_DB_URL
                    try {
                        const sql = getSqlDatabase();
                        const rows = await sql`
                            SELECT message_type, from_email, to_email, subject, message, created_at
                            FROM ticket_conversations
                            WHERE ticket_id = ${ticketId}
                            ORDER BY created_at ASC;
                        `;

                        const conversation = (rows || []).map((row) => ({
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
                                conversation,
                                count: conversation.length,
                                fallbackSql: true
                            })
                        };
                    } catch (e) {
                        // If SQL fallback fails, return setup help.
                    }
                }

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
                        needsSetup: true,
                        initUrl: '/.netlify/functions/init-conversations-table',
                        setupHint: likelySchemaCache
                            ? 'ticket_conversations exists but Supabase REST cannot see it (schema cache / mismatched project URL/key). Verify SUPABASE_URL and keys match the same project as SUPABASE_DB_URL.'
                            : 'Run the initializer once (requires SUPABASE_DB_URL in Netlify), or create the ticket_conversations table in Supabase SQL editor.'
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