const { getDatabase } = require('./lib/database');

// Helper function to generate ticket number
async function generateTicketNumber(sql) {
    const currentYear = new Date().getFullYear();
    
    // Get the highest existing ticket number for the current year
    const existingNumbers = await sql`
        SELECT ticket_number 
        FROM tickets 
        WHERE ticket_number LIKE ${'TK-' + currentYear + '-%'}
        ORDER BY ticket_number DESC 
        LIMIT 1
    `;

    let nextNumber = 1;
    if (existingNumbers.length > 0) {
        const lastNumber = existingNumbers[0].ticket_number;
        const numberPart = lastNumber.split('-').pop();
        nextNumber = parseInt(numberPart) + 1;
    }

    return `TK-${currentYear}-${nextNumber.toString().padStart(4, '0')}`;
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
        console.log('Updating database schema for ticket numbers and analytics...');

        const sql = getDatabase();

        // Add ticket_number column to tickets table if it doesn't exist
        try {
            await sql`
                ALTER TABLE tickets 
                ADD COLUMN IF NOT EXISTS ticket_number VARCHAR(20) UNIQUE
            `;
            console.log('Added ticket_number column to tickets table');
        } catch (error) {
            console.log('ticket_number column handling:', error.message);
        }

        // Add category column for analytics
        try {
            await sql`
                ALTER TABLE tickets 
                ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'general'
            `;
            console.log('Added category column to tickets table');
        } catch (error) {
            console.log('category column handling:', error.message);
        }

        // Add priority column for analytics
        try {
            await sql`
                ALTER TABLE tickets 
                ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium'
            `;
            console.log('Added priority column to tickets table');
        } catch (error) {
            console.log('priority column handling:', error.message);
        }

        // Add resolution_time column for analytics (in hours)
        try {
            await sql`
                ALTER TABLE tickets 
                ADD COLUMN IF NOT EXISTS resolution_time INTEGER
            `;
            console.log('Added resolution_time column to tickets table');
        } catch (error) {
            console.log('resolution_time column handling:', error.message);
        }

        // Add closed_at timestamp for analytics
        try {
            await sql`
                ALTER TABLE tickets 
                ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP
            `;
            console.log('Added closed_at column to tickets table');
        } catch (error) {
            console.log('closed_at column handling:', error.message);
        }

        // Add is_manual column for tracking manual ticket entries
        try {
            await sql`
                ALTER TABLE tickets 
                ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE
            `;
            console.log('Added is_manual column to tickets table');
        } catch (error) {
            console.log('is_manual column handling:', error.message);
        }

        // Add source column for tracking ticket origin
        try {
            await sql`
                ALTER TABLE tickets 
                ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'email'
            `;
            console.log('Added source column to tickets table');
        } catch (error) {
            console.log('source column handling:', error.message);
        }

        // Generate ticket numbers for existing tickets that don't have them
        const ticketsWithoutNumbers = await sql`
            SELECT id, created_at 
            FROM tickets 
            WHERE ticket_number IS NULL 
            ORDER BY created_at ASC
        `;

        console.log(`Found ${ticketsWithoutNumbers.length} tickets without numbers`);

        for (const ticket of ticketsWithoutNumbers) {
            const ticketNumber = await generateTicketNumber(sql);
            
            await sql`
                UPDATE tickets 
                SET ticket_number = ${ticketNumber}
                WHERE id = ${ticket.id}
            `;
            
            console.log(`Generated ticket number ${ticketNumber} for ticket ID ${ticket.id}`);
        }

        // Auto-categorize existing tickets based on subject keywords
        const uncategorizedTickets = await sql`
            SELECT id, subject 
            FROM tickets 
            WHERE category = 'general' OR category IS NULL
        `;

        console.log(`Found ${uncategorizedTickets.length} tickets to categorize`);

        for (const ticket of uncategorizedTickets) {
            const subject = ticket.subject ? ticket.subject.toLowerCase() : '';
            let category = 'general';

            if (subject.includes('password') || subject.includes('login') || subject.includes('access')) {
                category = 'account';
            } else if (subject.includes('payment') || subject.includes('billing') || subject.includes('invoice')) {
                category = 'billing';
            } else if (subject.includes('bug') || subject.includes('error') || subject.includes('issue') || subject.includes('problem')) {
                category = 'technical';
            } else if (subject.includes('feature') || subject.includes('request') || subject.includes('enhancement')) {
                category = 'feature-request';
            } else if (subject.includes('help') || subject.includes('how to') || subject.includes('tutorial')) {
                category = 'support';
            } else if (subject.includes('urgent') || subject.includes('emergency')) {
                category = 'urgent';
            }

            await sql`
                UPDATE tickets 
                SET category = ${category}
                WHERE id = ${ticket.id}
            `;
        }

        // Get updated schema info
        const columns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'tickets' 
            ORDER BY ordinal_position
        `;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Database schema updated successfully',
                ticketsUpdated: ticketsWithoutNumbers.length,
                categorizedTickets: uncategorizedTickets.length,
                schema: columns
            })
        };

    } catch (error) {
        console.error('Error updating database schema:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Failed to update database schema: ' + error.message
            })
        };
    }
};