const { createTicket, getTickets, getTicketByNumber, updateTicket, deleteTicket } = require('./lib/tickets');

function parseJsonBody(event) {
    const body = event && event.body;
    if (body == null) return null;
    if (typeof body === 'object') return body;

    const raw = String(body).trim();

    try {
        return JSON.parse(raw);
    } catch (e1) {
        try {
            let candidate = raw;
            if (candidate.startsWith('\\{"') || candidate.startsWith('\\[')) {
                candidate = candidate.slice(1);
            }
            candidate = candidate.replace(/\\"/g, '"');
            return JSON.parse(candidate);
        } catch {
            try {
                if (raw.startsWith('"') && raw.endsWith('"')) {
                    const unwrapped = raw.slice(1, -1).replace(/\\"/g, '"');
                    return JSON.parse(unwrapped);
                }
            } catch {
                // fall through
            }
            throw e1;
        }
    }
}

exports.handler = async (event, context) => {
    // Handle CORS
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
        const ticketData = parseJsonBody(event);

        // Validate required fields
        if (!ticketData.title || !ticketData.description) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'Title and description are required' })
            };
        }

        // If customer email is provided but no user exists, create one
        let customerUserId = null;
        if (ticketData.customerEmail && !ticketData.createdBy) {
            // Check if user exists
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('email', ticketData.customerEmail)
                .single();

            if (!existingUser) {
                // Create new customer user
                const tempPassword = Math.random().toString(36).slice(-12);
                const bcrypt = require('bcryptjs');
                const passwordHash = await bcrypt.hash(tempPassword, 12);

                const { data: newUser, error: userError } = await supabase
                    .from('users')
                    .insert({
                        email: ticketData.customerEmail,
                        password_hash: passwordHash,
                        full_name: ticketData.customerName,
                        role: 'customer',
                        company: ticketData.customerCompany,
                        phone: ticketData.customerPhone,
                        is_active: true
                    })
                    .select()
                    .single();

                if (!userError && newUser) {
                    customerUserId = newUser.id;
                    console.log(`Created new customer user: ${ticketData.customerEmail}`);
                }
            } else {
                customerUserId = existingUser.id;
            }
        }

        const result = await createTicket({
            ...ticketData,
            createdBy: ticketData.createdBy || customerUserId
        });

        if (result.success) {
            return {
                statusCode: 201,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    success: true,
                    ticket: result.ticket,
                    message: 'Ticket created successfully'
                })
            };
        } else {
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: result.error })
            };
        }
    } catch (error) {
        console.error('Error creating ticket:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Internal server error' })
        };
    }
};