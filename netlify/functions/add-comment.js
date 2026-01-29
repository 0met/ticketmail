const { getDatabase } = require('./lib/database');

function parseJsonBody(event) {
    const body = event && event.body;
    if (body == null) return null;
    if (typeof body === 'object') return body;

    const raw = String(body).trim();
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

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
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        const payload = parseJsonBody(event) || {};
        const ticketId = payload.ticketId;
        const message = String(payload.message || '').trim();
        const type = payload.type === 'internal' ? 'internal' : 'system';
        const from = payload.from ? String(payload.from).trim() : null;

        if (!ticketId || !message) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'ticketId and message are required' })
            };
        }

        const supabase = getDatabase();

        const { data, error } = await supabase
            .from('ticket_conversations')
            .insert({
                ticket_id: ticketId,
                message_type: type,
                from_email: from,
                message
            })
            .select('message_type, from_email, to_email, subject, message, created_at')
            .single();

        if (error) {
            if (isMissingRelation(error)) {
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        success: false,
                        error: 'ticket_conversations table is not set up in Supabase yet.'
                    })
                };
            }
            throw error;
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                comment: {
                    type: data.message_type,
                    from: data.from_email,
                    to: data.to_email,
                    subject: data.subject,
                    message: data.message,
                    date: data.created_at
                }
            })
        };
    } catch (error) {
        console.error('Error adding comment:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: 'Failed to add comment: ' + error.message })
        };
    }
};
