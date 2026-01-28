const { saveTicket } = require('./lib/database');

function parseJsonBody(event) {
    const body = event && event.body;
    if (body == null) return null;
    if (typeof body === 'object') return body;

    const raw = String(body).trim();

    // 1) Normal JSON
    try {
        return JSON.parse(raw);
    } catch (e1) {
        // 2) Body that looks like escaped JSON object (e.g. {\"a\":1})
        try {
            let candidate = raw;
            if (candidate.startsWith('\\{"') || candidate.startsWith('\\[')) {
                candidate = candidate.slice(1);
            }
            candidate = candidate.replace(/\\"/g, '"');
            return JSON.parse(candidate);
        } catch {
            // 3) Double-encoded JSON string (e.g. "{\"a\":1}")
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

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed. Use POST.'
            })
        };
    }

    try {
        const {
            subject,
            from,
            priority,
            category,
            content,
            isManual,
            customerId,
            customerName,
            customerPhone,
            customerEmail,
            companyId,
            companyName
        } = parseJsonBody(event) || {};

        // Validate required fields
        if (!subject || !from || !content) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required fields: subject, from, and content are required'
                })
            };
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(from)) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid email format for customer email'
                })
            };
        }

        console.log(`Creating manual ticket from ${from}: ${subject}`);

        // Generate a unique message ID for manual tickets
        const messageId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create ticket object
        const ticket = {
            subject: subject,
            from: from,
            to: 'support@ticketmail.com', // Default support email
            body: content,
            status: 'new',
            priority: priority || 'medium',
            category: category || 'general',
            messageId: messageId,
            date: new Date(),
            isManual: isManual || false,
            source: 'manual',
            customerId: customerId || null,
            customerName: customerName || null,
            customerPhone: customerPhone || null,
            customerEmail: customerEmail || from,
            companyId: companyId || null,
            companyName: companyName || null
        };

        // Save ticket to database
        const result = await saveTicket(ticket);

        if (result) {
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    message: 'Manual ticket created successfully',
                    ticket: result
                })
            };
        } else {
            throw new Error('Failed to save ticket to database');
        }

    } catch (error) {
        console.error('Error creating manual ticket:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Failed to create manual ticket: ' + error.message
            })
        };
    }
};