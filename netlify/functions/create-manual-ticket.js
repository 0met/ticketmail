const { saveTicket } = require('./lib/database');

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
        const { subject, from, priority, category, content, isManual } = JSON.parse(event.body);

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
            source: 'manual' // Add source identifier
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
                    ticket: {
                        subject: ticket.subject,
                        from: ticket.from,
                        priority: ticket.priority,
                        category: ticket.category,
                        status: ticket.status,
                        isManual: ticket.isManual,
                        messageId: messageId
                    }
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