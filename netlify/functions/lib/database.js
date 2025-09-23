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
        
        await sql`
            INSERT INTO tickets (subject, from_email, to_email, body_text, status, email_id, received_at)
            VALUES (${ticket.subject}, ${ticket.from}, ${ticket.to}, ${ticket.body}, ${ticket.status}, ${ticket.messageId}, ${ticket.date})
            ON CONFLICT (email_id) DO UPDATE SET
                subject = EXCLUDED.subject,
                body_text = EXCLUDED.body_text,
                status = EXCLUDED.status,
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
            SELECT id, subject, from_email, to_email, body_text, status, received_at, created_at
            FROM tickets 
            ORDER BY received_at DESC 
            LIMIT ${limit}
        `;
        
        return result.map(ticket => ({
            id: ticket.id,
            subject: ticket.subject,
            from: ticket.from_email,
            to: ticket.to_email,
            body: ticket.body_text,
            status: ticket.status,
            date: new Date(ticket.received_at),
            createdAt: ticket.created_at
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
        
        await sql`
            UPDATE tickets 
            SET status = ${status}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ${ticketId}
        `;
        
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