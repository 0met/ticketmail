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

// Save ticket to database
async function saveTicket(ticket) {
    try {
        const sql = getDatabase();
        
        // Generate ticket number
        const year = new Date().getFullYear();
        const timestamp = Date.now().toString().slice(-4); // Last 4 digits of timestamp
        const randomNum = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        const ticketNumber = `TK-${year}-${timestamp}${randomNum}`;
        
        console.log('Saving ticket with generated number:', ticketNumber);
        
        await sql`
            INSERT INTO tickets (
                subject, 
                from_email, 
                to_email, 
                body_text, 
                status, 
                email_id, 
                received_at, 
                ticket_number,
                priority, 
                category,
                is_manual,
                source
            )
            VALUES (
                ${ticket.subject}, 
                ${ticket.from}, 
                ${ticket.to}, 
                ${ticket.body}, 
                ${ticket.status}, 
                ${ticket.messageId}, 
                ${ticket.date},
                ${ticketNumber},
                ${ticket.priority || 'medium'},
                ${ticket.category || 'general'},
                ${ticket.isManual || false},
                ${ticket.source || 'email'}
            )
            ON CONFLICT (email_id) DO UPDATE SET
                subject = EXCLUDED.subject,
                body_text = EXCLUDED.body_text,
                status = EXCLUDED.status,
                priority = EXCLUDED.priority,
                category = EXCLUDED.category,
                updated_at = CURRENT_TIMESTAMP
        `;
        
        return true;
    } catch (error) {
        console.error('Error saving ticket:', error);
        throw error;
    }
}

// Get all tickets
async function getTickets(limit = 100) {
    try {
        const sql = getDatabase();
        
        const result = await sql`
            SELECT id, subject, from_email, to_email, body_text, status, received_at, created_at, updated_at,
                   ticket_number, priority, category, resolution_time, closed_at, is_manual, source
            FROM tickets 
            ORDER BY received_at DESC 
            LIMIT ${limit}
        `;
        
        return result.map(ticket => ({
            id: ticket.id,
            ticketNumber: ticket.ticket_number,
            subject: ticket.subject,
            from: ticket.from_email,
            to: ticket.to_email,
            body: ticket.body_text,
            status: ticket.status,
            priority: ticket.priority || 'medium',
            category: ticket.category || 'general',
            date: new Date(ticket.received_at),
            createdAt: ticket.created_at,
            updatedAt: ticket.updated_at,
            resolutionTime: ticket.resolution_time,
            closedAt: ticket.closed_at,
            isManual: ticket.is_manual || false,
            source: ticket.source || 'email'
        }));
    } catch (error) {
        console.error('Error getting tickets:', error);
        throw error;
    }
}

// Update ticket status
async function updateTicketStatus(ticketId, status) {
    try {
        const sql = getDatabase();
        
        console.log(`Updating ticket ${ticketId} to status ${status}`);
        
        // First, let's check if the ticket exists (without UUID casting)
        const existingTicket = await sql`
            SELECT id, status FROM tickets WHERE id = ${ticketId}
        `;
        
        console.log('Existing ticket:', existingTicket);
        
        if (existingTicket.length === 0) {
            console.log('Ticket not found!');
            return { success: false, error: 'Ticket not found' };
        }
        
        // Now update without UUID casting
        const result = await sql`
            UPDATE tickets 
            SET status = ${status}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ${ticketId}
        `;
        
        console.log('Update result:', result);
        console.log('Update result count:', result.count);
        
        // Verify the update worked
        const updatedTicket = await sql`
            SELECT id, status, updated_at FROM tickets WHERE id = ${ticketId}
        `;
        
        console.log('After update:', updatedTicket);
        
        return { success: true, updatedTicket: updatedTicket[0] };
    } catch (error) {
        console.error('Error updating ticket status:', error);
        return { success: false, error: error.message };
    }
}

// Generic update ticket function
async function updateTicket(ticketId, updates) {
    try {
        const sql = getDatabase();
        
        console.log(`Updating ticket ${ticketId} with updates:`, updates);
        
        // Check if ticket exists first (without UUID casting)
        const existingTicket = await sql`
            SELECT id FROM tickets WHERE id = ${ticketId}
        `;
        
        console.log('Existing ticket check:', existingTicket);
        
        if (existingTicket.length === 0) {
            console.log('Ticket not found!');
            return { success: false, error: 'Ticket not found' };
        }
        
        // Handle each field individually to ensure proper parameter binding (without UUID casting)
        for (const [key, value] of Object.entries(updates)) {
            console.log(`Updating ${key} to ${value} for ticket ${ticketId}`);
            
            if (key === 'priority') {
                const result = await sql`UPDATE tickets SET priority = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${ticketId}`;
                console.log(`Priority update result:`, result);
            } else if (key === 'category') {
                const result = await sql`UPDATE tickets SET category = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${ticketId}`;
                console.log(`Category update result:`, result);
            } else if (key === 'status') {
                const result = await sql`UPDATE tickets SET status = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${ticketId}`;
                console.log(`Status update result:`, result);
            } else if (key === 'resolutionTime') {
                const result = await sql`UPDATE tickets SET resolution_time = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${ticketId}`;
                console.log(`Resolution time update result:`, result);
            } else if (key === 'closedAt') {
                const result = await sql`UPDATE tickets SET closed_at = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${ticketId}`;
                console.log(`Closed at update result:`, result);
            }
        }
        
        // Get the updated ticket (without UUID casting)
        const updatedTicket = await sql`
            SELECT * FROM tickets WHERE id = ${ticketId}
        `;
        
        console.log('Update completed. Updated ticket:', updatedTicket[0]);
        
        return { success: true, ticket: updatedTicket[0] };
    } catch (error) {
        console.error('Error updating ticket:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    getDatabase,
    getUserSettings,
    saveUserSettings,
    saveTicket,
    getTickets,
    updateTicketStatus,
    updateTicket,
    encryptData,
    decryptData
};