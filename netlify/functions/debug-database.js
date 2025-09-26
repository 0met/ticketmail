const { getUserSettings, saveTicket, getTickets, getDatabase } = require('./lib/database');

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

        // Test 5: Add customer columns to tickets table
        try {
            console.log('Adding customer columns to tickets table...');
            const sql = getDatabase();
            
            // Check if columns already exist
            const existingColumns = await sql`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'tickets' 
                AND column_name IN ('customer_name', 'customer_id', 'customer_phone', 'customer_email')
            `;
            
            if (existingColumns.length === 0) {
                await sql`
                    ALTER TABLE tickets 
                    ADD COLUMN customer_name TEXT,
                    ADD COLUMN customer_id TEXT,
                    ADD COLUMN customer_phone TEXT,
                    ADD COLUMN customer_email TEXT
                `;
                results.tests.addCustomerColumns = {
                    success: true,
                    message: 'Customer columns added successfully'
                };
            } else {
                results.tests.addCustomerColumns = {
                    success: true,
                    message: 'Customer columns already exist',
                    existingColumns: existingColumns.map(c => c.column_name)
                };
            }
        } catch (error) {
            results.tests.addCustomerColumns = {
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