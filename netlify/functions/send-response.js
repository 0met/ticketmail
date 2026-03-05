const nodemailer = require('nodemailer');

const { getDatabase, getSqlDatabase, getUserSettings } = require('./lib/database');

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

function isSchemaCache(error) {
    const msg = (error && error.message ? String(error.message) : '').toLowerCase();
    return msg.includes('schema cache') || msg.includes('could not find the table');
}

function isMissingColumn(error) {
    const msg = (error && error.message ? String(error.message) : '').toLowerCase();
    return msg.includes('column') && msg.includes('does not exist');
}

function isUniqueViolation(error) {
    if (!error) return false;
    const code = String(error.code || '').toLowerCase();
    const msg = String(error.message || '').toLowerCase();
    return code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint');
}

function extractEmail(value) {
    if (!value) return null;
    const raw = String(value).trim();
    const angle = raw.match(/<\s*([^>\s]+@[^>\s]+)\s*>/);
    if (angle && angle[1]) return angle[1].toLowerCase();
    const token = raw.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
    if (token && token[1]) return token[1].toLowerCase();
    return null;
}

function splitEmailList(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map(extractEmail).filter(Boolean);
    }

    return String(value)
        .split(/[,;\n]+/)
        .map((v) => extractEmail(v))
        .filter(Boolean);
}

function normalizeSubject(subject, ticketNumber) {
    const raw = String(subject || '').trim();
    const base = raw || 'Support Response';
    const prefixed = /^re\s*:/i.test(base) ? base : `Re: ${base}`;
    if (!ticketNumber) return prefixed;

    const token = String(ticketNumber).trim();
    if (!token) return prefixed;
    if (prefixed.includes(token)) return prefixed;
    return `[${token}] ${prefixed}`;
}

async function insertOutboundConversation(supabase, row) {
    // Best-effort: schema may vary between installs.
    const baseInsert = {
        ticket_id: row.ticketId,
        message_type: 'outbound',
        from_email: row.from,
        message: row.message
    };

    const fullInsert = {
        ...baseInsert,
        ...(row.emailMessageId ? { email_message_id: row.emailMessageId } : {}),
        to_email: row.to,
        subject: row.subject
    };

    try {
        const { error } = await supabase
            .from('ticket_conversations')
            .insert(fullInsert);
        if (error) {
            if (isUniqueViolation(error)) return { ok: true, deduped: true };
            if (isMissingRelation(error)) {
                // If Supabase REST can't see the table (schema cache), try direct SQL via SUPABASE_DB_URL.
                if (isSchemaCache(error)) {
                    try {
                        const sql = getSqlDatabase();
                        const emailMessageId = row.emailMessageId || null;
                        const ticketId = row.ticketId;
                        const fromEmail = row.from || null;
                        const toEmail = row.to || null;
                        const subject = row.subject || null;
                        const message = String(row.message || '').slice(0, 8000);

                        if (emailMessageId) {
                            await sql`
                                INSERT INTO ticket_conversations (ticket_id, email_message_id, message_type, from_email, to_email, subject, message)
                                SELECT ${ticketId}, ${emailMessageId}, 'outbound', ${fromEmail}, ${toEmail}, ${subject}, ${message}
                                WHERE NOT EXISTS (
                                    SELECT 1 FROM ticket_conversations WHERE email_message_id = ${emailMessageId}
                                );
                            `;
                        } else {
                            await sql`
                                INSERT INTO ticket_conversations (ticket_id, message_type, from_email, to_email, subject, message)
                                VALUES (${ticketId}, 'outbound', ${fromEmail}, ${toEmail}, ${subject}, ${message});
                            `;
                        }

                        return { ok: true, fallbackSql: true };
                    } catch (e) {
                        return { ok: false, reason: 'missing_table', error: e };
                    }
                }

                return { ok: false, reason: 'missing_table' };
            }
            if (isMissingColumn(error)) {
                const { error: fallbackError } = await supabase
                    .from('ticket_conversations')
                    .insert(baseInsert);
                if (fallbackError) {
                    if (isUniqueViolation(fallbackError)) return { ok: true, deduped: true };
                    if (isMissingRelation(fallbackError)) return { ok: false, reason: 'missing_table' };
                    return { ok: false, reason: 'insert_failed', error: fallbackError };
                }
                return { ok: true, fallback: true };
            }
            return { ok: false, reason: 'insert_failed', error };
        }
        return { ok: true };
    } catch (error) {
        if (isMissingRelation(error)) return { ok: false, reason: 'missing_table' };
        if (isUniqueViolation(error)) return { ok: true, deduped: true };
        return { ok: false, reason: 'exception', error };
    }
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
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: 'Method not allowed. Use POST.' })
        };
    }

    try {
        const payload = parseJsonBody(event) || {};
        const ticketId = payload.ticketId;
        const message = String(payload.message || '').trim();
        const providedTo = payload.to ? String(payload.to).trim() : null;
        const providedSubject = payload.subject ? String(payload.subject).trim() : null;
        const ccList = splitEmailList(payload.cc);
        const sendCopy = Boolean(payload.sendCopy);

        if (!ticketId || !message) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'ticketId and message are required' })
            };
        }

        const settings = await getUserSettings();
        if (!settings || !settings.gmailAddress || !settings.appPassword) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: 'Gmail settings not configured. Save Gmail address + app password in Settings first.'
                })
            };
        }

        const supabase = getDatabase();

        // Prefer ticket data from DB (more reliable than client-provided fields)
        let ticket = null;
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select('id, subject, from_email, to_email, customer_email, ticket_number, message_id')
                .eq('id', ticketId)
                .limit(1);

            if (!error && data && data.length > 0) {
                ticket = data[0];
            }
        } catch (_) {
            // ignore, fallback to client-provided values
        }

        const ticketNumber = ticket && ticket.ticket_number ? ticket.ticket_number : null;
        const ticketSubject = ticket && ticket.subject ? ticket.subject : null;
        const toAddress =
            extractEmail(ticket && (ticket.customer_email || ticket.from_email)) ||
            extractEmail(providedTo) ||
            null;

        if (!toAddress) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: 'Could not determine recipient email for this ticket.'
                })
            };
        }

        const subject = normalizeSubject(providedSubject || ticketSubject, ticketNumber);

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: settings.gmailAddress,
                pass: settings.appPassword
            }
        });

        const mailOptions = {
            from: settings.gmailAddress,
            to: toAddress,
            subject,
            text: message,
            ...(ccList.length ? { cc: ccList } : {}),
            ...(sendCopy ? { bcc: settings.gmailAddress } : {})
        };

        // Attempt to thread replies when possible
        if (ticket && ticket.message_id) {
            mailOptions.inReplyTo = ticket.message_id;
            mailOptions.references = ticket.message_id;
        }

        const info = await transporter.sendMail(mailOptions);

        // Best-effort logging
        const logAttempt = await insertOutboundConversation(supabase, {
            ticketId,
            from: settings.gmailAddress,
            to: toAddress,
            subject,
            message,
            emailMessageId: info && info.messageId ? info.messageId : null
        });

        // Best-effort ticket timestamp bump
        try {
            await supabase
                .from('tickets')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', ticketId);
        } catch (_) {
            // ignore
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                message: 'Response sent',
                to: toAddress,
                cc: ccList,
                sendCopy,
                messageId: info && info.messageId ? info.messageId : null,
                logged: logAttempt && logAttempt.ok === true
            })
        };
    } catch (error) {
        console.error('Error in send-response:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: error && error.message ? error.message : 'Internal server error'
            })
        };
    }
};
