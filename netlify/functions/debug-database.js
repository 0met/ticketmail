const { getUserSettings, saveTicket, getTickets } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    try {
        console.log('Starting database debug...');
        
        const results = {
            tests: {},
            timestamp: new Date().toISOString()
        };

        // Test 1: Get user settings
        try {
            console.log('Testing getUserSettings...');
            const settings = await getUserSettings();
            results.tests.getUserSettings = {
                success: true,
                hasSettings: !!settings,
                hasEmail: settings ? !!settings.gmailAddress : false
            };
        } catch (error) {
            results.tests.getUserSettings = {
                success: false,
                error: error.message
            };
        }

        // Test 2: Try to save a test ticket
        try {
            console.log('Testing saveTicket...');
            const testTicket = {
                subject: 'Test Ticket - ' + Date.now(),
                from: 'test@example.com',
                to: 'support@example.com',
                body: 'This is a test ticket for debugging purposes.',
                status: 'new',
                messageId: 'test-' + Date.now(),
                date: new Date()
            };
            
            await saveTicket(testTicket);
            results.tests.saveTicket = {
                success: true,
                ticketSubject: testTicket.subject
            };
        } catch (error) {
            results.tests.saveTicket = {
                success: false,
                error: error.message
            };
        }

        // Test 3: Try to get tickets
        try {
            console.log('Testing getTickets...');
            const tickets = await getTickets(5);
            results.tests.getTickets = {
                success: true,
                count: Array.isArray(tickets) ? tickets.length : 0,
                tickets: Array.isArray(tickets) ? tickets.map(t => ({
                    id: t.id,
                    subject: t.subject,
                    from: t.from_email,
                    status: t.status
                })) : []
            };
        } catch (error) {
            results.tests.getTickets = {
                success: false,
                error: error.message
            };
        }

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Database debug complete',
                results: results
            })
        };

    } catch (error) {
        console.error('Error in database debug:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Database debug failed: ' + error.message
            })
        };
    }
};