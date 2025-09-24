const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto-js');

// Database connection - initialized on demand
let sql = null;

// Initialize database connection
function initializeConnection() {
    if (sql) {
        return sql; // Return existing connection
    }
    
    try {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL environment variable is not set');
        }
        
        // Clean the URL and validate format
        const databaseUrl = process.env.DATABASE_URL.trim();
        console.log('Initializing Neon connection with URL length:', databaseUrl.length);
        console.log('URL starts with:', databaseUrl.substring(0, 20));
        
        if (!databaseUrl.startsWith('postgresql://')) {
            throw new Error(`Invalid DATABASE_URL format. Expected postgresql://, got: ${databaseUrl.substring(0, 20)}...`);
        }
        
        sql = neon(databaseUrl);
        console.log('Neon connection initialized successfully');
        return sql;
    } catch (error) {
        console.error('Error initializing Neon connection:', error);
        throw error;
    }
}

// Get database connection
function getDatabase() {
    return initializeConnection();
}

// Encrypt sensitive data before storing
function encryptData(text) {
    if (!text) return null;
    const secretKey = process.env.ENCRYPTION_KEY || 'default-secret-key';
    return crypto.AES.encrypt(text, secretKey).toString();
}

// Decrypt sensitive data after retrieving
function decryptData(encryptedText) {
    if (!encryptedText) return null;
    try {
        const secretKey = process.env.ENCRYPTION_KEY || 'default-secret-key';
        const bytes = crypto.AES.decrypt(encryptedText, secretKey);
        return bytes.toString(crypto.enc.Utf8);
    } catch (error) {
        console.error('Error decrypting data:', error);
        return null;
    }
}

// Initialize database tables if they don't exist
async function initializeDatabase() {
    try {
        const sql = getDatabase();
        
        // Create settings table
        await sql`
            CREATE TABLE IF NOT EXISTS user_settings (
                id SERIAL PRIMARY KEY,
                gmail_address VARCHAR(255) NOT NULL,
                app_password TEXT NOT NULL,
                refresh_interval INTEGER DEFAULT 5,
                default_status VARCHAR(50) DEFAULT 'new',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // Create tickets table
        await sql`
            CREATE TABLE IF NOT EXISTS tickets (
                id SERIAL PRIMARY KEY,
                subject TEXT NOT NULL,
                from_email VARCHAR(255) NOT NULL,
                to_email VARCHAR(255),
                body TEXT,
                status VARCHAR(50) DEFAULT 'new',
                message_id VARCHAR(255) UNIQUE,
                date_received TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // Create indexes for better performance
        await sql`
            CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)
        `;
        
        await sql`
            CREATE INDEX IF NOT EXISTS idx_tickets_date ON tickets(date_received)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_tickets_message_id ON tickets(message_id)
        `;

        console.log('Database initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}

// Get user settings
async function getUserSettings() {
    try {
        const sql = getDatabase();
        
        const result = await sql`
            SELECT gmail_address, app_password, refresh_interval, default_status 
            FROM user_settings 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        
        if (result.length > 0) {
            const settings = result[0];
            return {
                gmailAddress: settings.gmail_address,
                appPassword: decryptData(settings.app_password),
                refreshInterval: settings.refresh_interval,
                defaultStatus: settings.default_status
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error getting user settings:', error);
        throw error;
    }
}

// Save user settings
async function saveUserSettings(settings) {
    try {
        const sql = getDatabase();
        const encryptedPassword = encryptData(settings.appPassword);
        
        // Delete existing settings and insert new ones
        await sql`DELETE FROM user_settings`;
        
        await sql`
            INSERT INTO user_settings (gmail_address, app_password, refresh_interval, default_status)
            VALUES (${settings.gmailAddress}, ${encryptedPassword}, ${settings.refreshInterval}, ${settings.defaultStatus})
        `;
        
        return true;
    } catch (error) {
        console.error('Error saving user settings:', error);
        throw error;
    }
}

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

// Auto-categorize ticket based on subject and body
function categorizeTicket(subject, body) {
    const text = `${subject} ${body}`.toLowerCase();
    
    if (text.includes('password') || text.includes('login') || text.includes('access') || text.includes('account')) {
        return 'account';
    } else if (text.includes('payment') || text.includes('billing') || text.includes('invoice') || text.includes('charge')) {
        return 'billing';
    } else if (text.includes('bug') || text.includes('error') || text.includes('issue') || text.includes('problem') || text.includes('broken')) {
        return 'technical';
    } else if (text.includes('feature') || text.includes('request') || text.includes('enhancement') || text.includes('suggestion')) {
        return 'feature-request';
    } else if (text.includes('help') || text.includes('how to') || text.includes('tutorial') || text.includes('guide')) {
        return 'support';
    } else if (text.includes('urgent') || text.includes('emergency') || text.includes('asap') || text.includes('critical')) {
        return 'urgent';
    }
    
    return 'general';
}

// Determine priority based on subject and body
function determinePriority(subject, body) {
    const text = `${subject} ${body}`.toLowerCase();
    
    if (text.includes('urgent') || text.includes('emergency') || text.includes('critical') || text.includes('asap')) {
        return 'high';
    } else if (text.includes('important') || text.includes('priority') || text.includes('soon')) {
        return 'medium';
    }
    
    return 'low';
}

// Save ticket to database
async function saveTicket(ticket) {
    try {
        const sql = getDatabase();
        
        // Try to generate ticket number, fallback if columns don't exist
        let ticketNumber;
        try {
            ticketNumber = await generateTicketNumber(sql);
        } catch (error) {
            console.log('Ticket number generation failed, using fallback');
            ticketNumber = `TK-2025-${Date.now().toString().slice(-4)}`;
        }
        
        // Auto-categorize and prioritize
        const category = categorizeTicket(ticket.subject || '', ticket.body || '');
        const priority = determinePriority(ticket.subject || '', ticket.body || '');
        
        // Try new schema first, fallback to old schema
        try {
            const result = await sql`
                INSERT INTO tickets (
                    ticket_number,
                    subject, 
                    from_email, 
                    to_email, 
                    body, 
                    status, 
                    message_id, 
                    date_received,
                    category,
                    priority
                )
                VALUES (
                    ${ticketNumber},
                    ${ticket.subject}, 
                    ${ticket.from}, 
                    ${ticket.to}, 
                    ${ticket.body}, 
                    ${ticket.status || 'new'}, 
                    ${ticket.messageId}, 
                    ${ticket.date},
                    ${category},
                    ${priority}
                )
                ON CONFLICT (message_id) DO UPDATE SET
                    subject = EXCLUDED.subject,
                    body = EXCLUDED.body,
                    status = EXCLUDED.status,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id, ticket_number
            `;
            
            console.log(`Created ticket ${ticketNumber} with ID ${result[0]?.id}`);
            return result[0];
        } catch (schemaError) {
            console.log('New schema failed, trying old schema:', schemaError.message);
            
            // Fallback to old schema
            const result = await sql`
                INSERT INTO tickets (
                    subject, 
                    from_email, 
                    to_email, 
                    body_text, 
                    status, 
                    email_id, 
                    received_at
                )
                VALUES (
                    ${ticket.subject}, 
                    ${ticket.from}, 
                    ${ticket.to}, 
                    ${ticket.body}, 
                    ${ticket.status || 'new'}, 
                    ${ticket.messageId}, 
                    ${ticket.date}
                )
                ON CONFLICT (email_id) DO UPDATE SET
                    subject = EXCLUDED.subject,
                    body_text = EXCLUDED.body_text,
                    status = EXCLUDED.status,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
            `;
            
            console.log(`Created ticket with old schema, ID ${result[0]?.id}`);
            return { id: result[0]?.id, ticket_number: ticketNumber };
        }
    } catch (error) {
        console.error('Error saving ticket:', error);
        throw error;
    }
}

// Get all tickets
async function getTickets(limit = 100) {
    try {
        const sql = getDatabase();
        
        // Try the new schema first, fallback to old schema if columns don't exist
        try {
            const result = await sql`
                SELECT 
                    id, 
                    ticket_number,
                    subject, 
                    from_email, 
                    to_email, 
                    body, 
                    status, 
                    category,
                    priority,
                    date_received, 
                    created_at,
                    updated_at,
                    closed_at,
                    resolution_time
                FROM tickets 
                ORDER BY date_received DESC 
                LIMIT ${limit}
            `;
            
            return result.map(ticket => ({
                id: ticket.id,
                ticketNumber: ticket.ticket_number,
                subject: ticket.subject,
                from: ticket.from_email,
                to: ticket.to_email,
                body: ticket.body,
                status: ticket.status,
                category: ticket.category || 'general',
                priority: ticket.priority || 'medium',
                date: new Date(ticket.date_received),
                createdAt: ticket.created_at,
                updatedAt: ticket.updated_at,
                closedAt: ticket.closed_at,
                resolutionTime: ticket.resolution_time
            }));
        } catch (schemaError) {
            console.log('New schema failed, trying fallback:', schemaError.message);
            
            // Fallback to old schema
            const result = await sql`
                SELECT 
                    id, 
                    subject, 
                    from_email, 
                    to_email, 
                    COALESCE(body, body_text) as body, 
                    status, 
                    COALESCE(date_received, received_at) as date_received, 
                    created_at
                FROM tickets 
                ORDER BY COALESCE(date_received, received_at) DESC 
                LIMIT ${limit}
            `;
            
            return result.map(ticket => ({
                id: ticket.id,
                ticketNumber: `TK-2025-${ticket.id.toString().padStart(4, '0')}`, // Generate fallback ticket number
                subject: ticket.subject,
                from: ticket.from_email,
                to: ticket.to_email,
                body: ticket.body,
                status: ticket.status,
                category: 'general', // Default category
                priority: 'medium', // Default priority
                date: new Date(ticket.date_received),
                createdAt: ticket.created_at,
                updatedAt: ticket.created_at,
                closedAt: null,
                resolutionTime: null
            }));
        }
    } catch (error) {
        console.error('Error getting tickets:', error);
        throw error;
    }
}

// Update ticket status
async function updateTicketStatus(ticketId, status) {
    try {
        const sql = getDatabase();
        
        // If status is changing to closed, calculate resolution time
        if (status === 'closed') {
            // Get ticket creation time
            const ticket = await sql`
                SELECT created_at FROM tickets WHERE id = ${ticketId}
            `;
            
            if (ticket.length > 0) {
                const createdAt = new Date(ticket[0].created_at);
                const closedAt = new Date();
                const resolutionTimeHours = Math.round((closedAt - createdAt) / (1000 * 60 * 60));
                
                await sql`
                    UPDATE tickets 
                    SET 
                        status = ${status}, 
                        updated_at = CURRENT_TIMESTAMP,
                        closed_at = CURRENT_TIMESTAMP,
                        resolution_time = ${resolutionTimeHours}
                    WHERE id = ${ticketId}
                `;
            }
        } else {
            await sql`
                UPDATE tickets 
                SET status = ${status}, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ${ticketId}
            `;
        }
        
        return true;
    } catch (error) {
        console.error('Error updating ticket status:', error);
        throw error;
    }
}

module.exports = {
    getDatabase,
    getUserSettings,
    saveUserSettings,
    saveTicket,
    getTickets,
    updateTicketStatus,
    encryptData,
    decryptData
};