const { validateSession } = require('./lib/auth');
const { getDatabase, getSqlDatabase } = require('./lib/database');

function getBearerToken(event) {
    const raw = event && event.headers ? (event.headers.authorization || event.headers.Authorization) : null;
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s.toLowerCase().startsWith('bearer ')) return null;
    return s.slice('bearer '.length).trim();
}

function jsonResponse(statusCode, payload) {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    };
}

function isConversationTableMissing(error) {
    const msg = (error && error.message ? String(error.message) : '').toLowerCase();
    return msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('relation') || msg.includes('ticket_conversations');
}

function normalizeTicketRef(ref) {
    const raw = String(ref ?? '').trim();
    if (!raw) return { type: null, value: null };

    if (/^\d+$/.test(raw)) {
        return { type: 'id', value: Number(raw) };
    }

    // Allow direct UUID-ish ids too
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
        return { type: 'id', value: raw };
    }

    // Otherwise treat as ticket number
    return { type: 'ticket_number', value: raw };
}

async function resolveTicket(supabase, ref, selectFields) {
    if (ref.type === 'id') {
        const { data, error } = await supabase
            .from('tickets')
            .select(selectFields)
            .eq('id', ref.value)
            .single();
        if (error) return { ticket: null, error };
        return { ticket: data, error: null };
    }

    if (ref.type === 'ticket_number') {
        const { data, error } = await supabase
            .from('tickets')
            .select(selectFields)
            .eq('ticket_number', ref.value)
            .single();
        if (error) return { ticket: null, error };
        return { ticket: data, error: null };
    }

    return { ticket: null, error: new Error('Invalid ticket reference') };
}

async function addSystemNote({ supabase, sqlDb, ticketId, message }) {
    const insertRow = {
        ticket_id: ticketId,
        message_type: 'system',
        message: message,
        created_at: new Date().toISOString()
    };

    const { error } = await supabase
        .from('ticket_conversations')
        .insert(insertRow);

    if (!error) return { ok: true, via: 'rest' };

    if (!isConversationTableMissing(error)) {
        throw error;
    }

    // Fallback to direct SQL
    await sqlDb`
        INSERT INTO public.ticket_conversations (ticket_id, message_type, message, created_at)
        VALUES (${ticketId}, ${'system'}, ${message}, NOW())
    `;

    return { ok: true, via: 'sql' };
}

async function moveConversations({ supabase, sqlDb, sourceTicketId, targetTicketId }) {
    const { error } = await supabase
        .from('ticket_conversations')
        .update({ ticket_id: targetTicketId })
        .eq('ticket_id', sourceTicketId);

    if (!error) return { ok: true, via: 'rest' };

    if (!isConversationTableMissing(error)) {
        throw error;
    }

    await sqlDb`
        UPDATE public.ticket_conversations
        SET ticket_id = ${targetTicketId}
        WHERE ticket_id = ${sourceTicketId}
    `;

    return { ok: true, via: 'sql' };
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod === 'OPTIONS') {
        return jsonResponse(200, {});
    }

    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { success: false, error: 'Method not allowed. Use POST.' });
    }

    try {
        const sessionToken = getBearerToken(event);
        if (!sessionToken) {
            return jsonResponse(401, { success: false, error: 'Missing Authorization Bearer token' });
        }

        const session = await validateSession(sessionToken);
        if (!session.valid) {
            return jsonResponse(401, { success: false, error: session.error || 'Invalid session' });
        }

        const role = String(session.user?.role || '').toLowerCase();
        if (role !== 'admin' && role !== 'agent') {
            return jsonResponse(403, { success: false, error: 'Forbidden: only admins and agents can merge tickets' });
        }

        const body = event.body ? JSON.parse(event.body) : {};
        const sourceTicketId = body.sourceTicketId;
        const targetRefRaw = body.targetTicket;

        if (!sourceTicketId || !targetRefRaw) {
            return jsonResponse(400, { success: false, error: 'sourceTicketId and targetTicket are required' });
        }

        const supabase = getDatabase();
        const sqlDb = getSqlDatabase();

        const selectFields = 'id, ticket_number, subject, status';

        const source = await resolveTicket(supabase, { type: 'id', value: sourceTicketId }, selectFields);
        if (source.error || !source.ticket) {
            return jsonResponse(404, { success: false, error: 'Source ticket not found' });
        }

        const targetRef = normalizeTicketRef(targetRefRaw);
        if (!targetRef.type) {
            return jsonResponse(400, { success: false, error: 'Invalid targetTicket' });
        }

        const target = await resolveTicket(supabase, targetRef, selectFields);
        if (target.error || !target.ticket) {
            return jsonResponse(404, { success: false, error: 'Target ticket not found' });
        }

        const sourceId = source.ticket.id;
        const targetId = target.ticket.id;

        if (String(sourceId) === String(targetId)) {
            return jsonResponse(400, { success: false, error: 'Source and target tickets must be different' });
        }

        // 1) Move conversations
        const moveResult = await moveConversations({ supabase, sqlDb, sourceTicketId: sourceId, targetTicketId: targetId });

        // 2) Add system notes
        const who = session.user?.email ? ` by ${session.user.email}` : '';
        const sourceLabel = source.ticket.ticket_number || `#${sourceId}`;
        const targetLabel = target.ticket.ticket_number || `#${targetId}`;

        const noteForTarget = `Merged ${sourceLabel} into this ticket${who}.`;
        const noteForSource = `This ticket was merged into ${targetLabel}${who}.`;

        await addSystemNote({ supabase, sqlDb, ticketId: targetId, message: noteForTarget });
        await addSystemNote({ supabase, sqlDb, ticketId: sourceId, message: noteForSource });

        // 3) Close source ticket
        const { error: closeError } = await supabase
            .from('tickets')
            .update({
                status: 'closed',
                closed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', sourceId);

        if (closeError) {
            throw closeError;
        }

        return jsonResponse(200, {
            success: true,
            source: { id: sourceId, ticket_number: source.ticket.ticket_number },
            target: { id: targetId, ticket_number: target.ticket.ticket_number },
            conversationMove: moveResult.via
        });
    } catch (error) {
        console.error('Error merging tickets:', error);
        return jsonResponse(500, { success: false, error: `Failed to merge tickets: ${error.message}` });
    }
};
