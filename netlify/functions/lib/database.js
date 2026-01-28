const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto-js');
function getLocalDB() {
    // IMPORTANT: database-local depends on native sqlite3.
    // Keep this require lazy so production (Supabase) never loads sqlite3.
    // eslint-disable-next-line global-require
    return require('./database-local').getDatabase();
}

const generateTicketNumber = (seed = null) => {
    const year = new Date().getFullYear();
    if (seed !== null && seed !== undefined) {
        const paddedSeed = String(seed).replace(/[^0-9]/g, '').padStart(6, '0').slice(-6);
        return `TK-${year}-${paddedSeed}`;
    }

    const timestampFragment = Date.now().toString().slice(-4);
    const randomFragment = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `TK-${year}-${timestampFragment}${randomFragment}`;
};

async function ensureUniqueTicketNumber(supabase, preferredNumber = null) {
    const seenNumbers = new Set();
    const maxAttempts = 5;

    const numberExists = async (candidate) => {
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select('id')
                .eq('ticket_number', candidate)
                .limit(1);

            if (error) {
                if (error.message && error.message.toLowerCase().includes('ticket_number')) {
                    console.warn('ticket_number column missing during uniqueness check:', error.message);
                    return false;
                }
                throw error;
            }

            return data && data.length > 0;
        } catch (error) {
            if (isColumnMissingError(error, 'ticket_number')) {
                console.warn('ticket_number column missing during uniqueness check:', error.message);
                return false;
            }
            throw error;
        }
    };

    if (preferredNumber) {
        if (!(await numberExists(preferredNumber))) {
            return preferredNumber;
        }
        seenNumbers.add(preferredNumber);
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = generateTicketNumber();
        if (seenNumbers.has(candidate)) {
            continue;
        }
        if (!(await numberExists(candidate))) {
            return candidate;
        }
        seenNumbers.add(candidate);
    }

    return `TK-${Date.now()}-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
}

function isColumnMissingError(error, columnName) {
    if (!error || !error.message || !columnName) {
        return false;
    }
    return error.message.toLowerCase().includes(columnName.toLowerCase());
}

// Database connection - initialized on demand
let supabase = null;

// Initialize database connection
function initializeConnection() {
    if (supabase) {
        return supabase; // Return existing connection
    }

    // Use Supabase for production
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Supabase environment variables not found. Falling back to local database.');
        console.log('🔌 Using Local SQLite Database Adapter');
        return getLocalDB();
    }

    console.log('🔌 Connecting to Supabase...');
    supabase = createClient(supabaseUrl, supabaseKey);
    return supabase;
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

// Initialize database connection (Supabase handles table creation)
async function initializeDatabase() {
    try {
        const supabase = getDatabase();

        // Test the connection by trying to select from a known table
        const { data, error } = await supabase
            .from('tickets')
            .select('id')
            .limit(1);

        if (error) {
            // If the table doesn't exist, that's okay - Supabase tables should be created via dashboard/migrations
            console.log('Note: Tables may need to be created in Supabase dashboard');
            console.log('Connection test result:', error.message);
        } else {
            console.log('Database connection verified successfully');
        }

        return true;
    } catch (error) {
        console.error('Error initializing database connection:', error);
        throw error;
    }
}

// Get user settings
async function getUserSettings() {
    try {
        const supabase = getDatabase();

        const { data, error } = await supabase
            .from('user_settings')
            .select('gmail_address, app_password, refresh_interval, default_status')
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Error fetching user settings:', error);
            throw error;
        }

        if (data && data.length > 0) {
            const settings = data[0];
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
        const supabase = getDatabase();
        const encryptedPassword = encryptData(settings.appPassword);

        // Delete existing settings
        const { error: deleteError } = await supabase
            .from('user_settings')
            .delete()
            .neq('id', 0); // Delete all records

        if (deleteError) {
            console.error('Error deleting existing settings:', deleteError);
            throw deleteError;
        }

        // Insert new settings
        const { error: insertError } = await supabase
            .from('user_settings')
            .insert({
                gmail_address: settings.gmailAddress,
                app_password: encryptedPassword,
                refresh_interval: settings.refreshInterval,
                default_status: settings.defaultStatus
            });

        if (insertError) {
            console.error('Error inserting user settings:', insertError);
            throw insertError;
        }

        return true;
    } catch (error) {
        console.error('Error saving user settings:', error);
        throw error;
    }
}

// Save ticket to database
async function saveTicket(ticket) {
    try {
        const supabase = getDatabase();

        const identifier = ticket.messageId || ticket.message_id || ticket.emailId || ticket.email_id;

        if (!identifier) {
            throw new Error('Ticket is missing a message identifier');
        }

        const ticketDate = ticket.date ? new Date(ticket.date) : new Date();
        const ticketNumber = await ensureUniqueTicketNumber(supabase, ticket.ticketNumber);

        console.log('Saving ticket with generated number:', ticketNumber);

        const ticketData = {
            subject: ticket.subject,
            from_email: ticket.from,
            to_email: ticket.to,
            body: ticket.body,
            status: ticket.status || 'new',
            message_id: identifier,
            date_received: ticketDate.toISOString(),
            ticket_number: ticketNumber,
            priority: ticket.priority || 'medium',
            category: ticket.category || 'general',
            is_manual: Boolean(ticket.isManual),
            source: ticket.source || 'email',
            customer_name: ticket.customerName || ticket.customer_name || null,
            customer_id: ticket.customerId || ticket.customer_id || null,
            customer_phone: ticket.customerPhone || ticket.customer_phone || null,
            customer_email: ticket.customerEmail || ticket.customer_email || ticket.from,
            company_id: ticket.companyId || ticket.company_id || null
        };

        const { data, error } = await supabase
            .from('tickets')
            .insert(ticketData)
            .select()
            .single();

        if (error) {
            console.error('Error inserting ticket:', error);
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error saving ticket:', error);
        throw error;
    }
}

async function fetchTicketByIdentifier(sql, identifier) {
    if (!identifier) return null;

    const queries = [
        async () => sql`
            SELECT * FROM tickets WHERE message_id = ${identifier} LIMIT 1
        `,
        async () => sql`
            SELECT * FROM tickets WHERE email_id = ${identifier} LIMIT 1
        `
    ];

    for (const query of queries) {
        try {
            const result = await query();
            if (result && result.length > 0) {
                return mapTicketRecord(result[0]);
            }
        } catch (error) {
            if (isColumnMissingError(error, 'message_id') || isColumnMissingError(error, 'email_id')) {
                continue;
            }
            throw error;
        }
    }

    return null;
}

async function insertTicketRecord(sql, values) {
    const attempts = [
        { identifier: 'message_id', dateColumn: 'date_received' },
        { identifier: 'message_id', dateColumn: 'received_at' },
        { identifier: 'email_id', dateColumn: 'date_received' },
        { identifier: 'email_id', dateColumn: 'received_at' }
    ];

    for (const attempt of attempts) {
        try {
            if (attempt.identifier === 'message_id') {
                await insertWithMessageId(sql, values, attempt.dateColumn);
            } else {
                await insertWithEmailId(sql, values, attempt.dateColumn);
            }
            return true;
        } catch (error) {
            if (isColumnMissingError(error, attempt.identifier) || isColumnMissingError(error, attempt.dateColumn)) {
                console.warn(`${attempt.identifier}/${attempt.dateColumn} column missing, retrying insert with fallback:`, error.message);
                continue;
            }
            throw error;
        }
    }

    throw new Error('Unable to insert ticket: required columns are missing');
}

async function insertWithMessageId(sql, values, dateColumn = 'date_received') {
    const {
        subject,
        fromEmail,
        toEmail,
        body,
        status,
        identifier,
        date,
        ticketNumber,
        priority,
        category,
        isManual,
        source
    } = values;

    if (dateColumn === 'received_at') {
        return sql`
            INSERT INTO tickets (
                subject,
                from_email,
                to_email,
                body,
                status,
                message_id,
                received_at,
                ticket_number,
                priority,
                category,
                is_manual,
                source,
                customer_name,
                customer_id,
                customer_phone,
                customer_email,
                company_id
            )
            VALUES (
                ${subject},
                ${fromEmail},
                ${toEmail},
                ${body},
                ${status},
                ${identifier},
                ${date},
                ${ticketNumber},
                ${priority},
                ${category},
                ${isManual},
                ${source},
                ${values.customerName},
                ${values.customerId},
                ${values.customerPhone},
                ${values.customerEmail},
                ${values.companyId}
            )
            ON CONFLICT (message_id) DO UPDATE SET
                subject = EXCLUDED.subject,
                body = EXCLUDED.body,
                customer_name = COALESCE(EXCLUDED.customer_name, customer_name),
                customer_id = COALESCE(EXCLUDED.customer_id, customer_id),
                customer_phone = COALESCE(EXCLUDED.customer_phone, customer_phone),
                customer_email = COALESCE(EXCLUDED.customer_email, customer_email),
                company_id = COALESCE(EXCLUDED.company_id, company_id),
                updated_at = CURRENT_TIMESTAMP
        `;
    }

    return sql`
        INSERT INTO tickets (
            subject,
            from_email,
            to_email,
            body,
            status,
            message_id,
            date_received,
            ticket_number,
            priority,
            category,
            is_manual,
            source,
            customer_name,
            customer_id,
            customer_phone,
            customer_email,
            company_id
        )
        VALUES (
            ${subject},
            ${fromEmail},
            ${toEmail},
            ${body},
            ${status},
            ${identifier},
            ${date},
            ${ticketNumber},
            ${priority},
            ${category},
            ${isManual},
            ${source},
            ${values.customerName},
            ${values.customerId},
            ${values.customerPhone},
            ${values.customerEmail},
            ${values.companyId}
        )
        ON CONFLICT (message_id) DO UPDATE SET
            subject = EXCLUDED.subject,
            body = EXCLUDED.body,
            customer_name = COALESCE(EXCLUDED.customer_name, customer_name),
            customer_id = COALESCE(EXCLUDED.customer_id, customer_id),
            customer_phone = COALESCE(EXCLUDED.customer_phone, customer_phone),
            customer_email = COALESCE(EXCLUDED.customer_email, customer_email),
            company_id = COALESCE(EXCLUDED.company_id, company_id),
            updated_at = CURRENT_TIMESTAMP
    `;
}

async function insertWithEmailId(sql, values, dateColumn = 'date_received') {
    const {
        subject,
        fromEmail,
        toEmail,
        body,
        status,
        identifier,
        date,
        ticketNumber,
        priority,
        category,
        isManual,
        source
    } = values;

    if (dateColumn === 'received_at') {
        return sql`
            INSERT INTO tickets (
                subject,
                from_email,
                to_email,
                body,
                status,
                email_id,
                received_at,
                ticket_number,
                priority,
                category,
                is_manual,
                source,
                customer_name,
                customer_id,
                customer_phone,
                customer_email,
                company_id
            )
            VALUES (
                ${subject},
                ${fromEmail},
                ${toEmail},
                ${body},
                ${status},
                ${identifier},
                ${date},
                ${ticketNumber},
                ${priority},
                ${category},
                ${isManual},
                ${source},
                ${values.customerName},
                ${values.customerId},
                ${values.customerPhone},
                ${values.customerEmail},
                ${values.companyId}
            )
            ON CONFLICT (email_id) DO UPDATE SET
                subject = EXCLUDED.subject,
                body = EXCLUDED.body,
                customer_name = COALESCE(EXCLUDED.customer_name, customer_name),
                customer_id = COALESCE(EXCLUDED.customer_id, customer_id),
                customer_phone = COALESCE(EXCLUDED.customer_phone, customer_phone),
                customer_email = COALESCE(EXCLUDED.customer_email, customer_email),
                company_id = COALESCE(EXCLUDED.company_id, company_id),
                updated_at = CURRENT_TIMESTAMP
        `;
    }

    return sql`
        INSERT INTO tickets (
            subject,
            from_email,
            to_email,
            body,
            status,
            email_id,
            date_received,
            ticket_number,
            priority,
            category,
            is_manual,
            source,
            customer_name,
            customer_id,
            customer_phone,
            customer_email,
            company_id
        )
        VALUES (
            ${subject},
            ${fromEmail},
            ${toEmail},
            ${body},
            ${status},
            ${identifier},
            ${date},
            ${ticketNumber},
            ${priority},
            ${category},
            ${isManual},
            ${source},
            ${values.customerName},
            ${values.customerId},
            ${values.customerPhone},
            ${values.customerEmail},
            ${values.companyId}
        )
        ON CONFLICT (email_id) DO UPDATE SET
            subject = EXCLUDED.subject,
            body = EXCLUDED.body,
            customer_name = COALESCE(EXCLUDED.customer_name, customer_name),
            customer_id = COALESCE(EXCLUDED.customer_id, customer_id),
            customer_phone = COALESCE(EXCLUDED.customer_phone, customer_phone),
            customer_email = COALESCE(EXCLUDED.customer_email, customer_email),
            company_id = COALESCE(EXCLUDED.company_id, company_id),
            updated_at = CURRENT_TIMESTAMP
    `;
}

function mapTicketRecord(ticket) {
    if (!ticket) return null;

    const bodyContent = ticket.body_text || ticket.body || ticket.body_html || '';
    const derivedTicketNumber = ticket.ticket_number || generateTicketNumber(ticket.id);
    const receivedTimestamp = ticket.received_at || ticket.date_received || ticket.created_at;
    const normalizedDate = normalizeTimestampValue(receivedTimestamp, new Date().toISOString());
    const createdTimestamp = normalizeTimestampValue(ticket.created_at, normalizedDate);
    const updatedTimestamp = normalizeTimestampValue(ticket.updated_at, createdTimestamp);

    return {
        id: ticket.id,
        ticketNumber: derivedTicketNumber,
        ticket_number: derivedTicketNumber,
        subject: ticket.subject,
        from: ticket.from_email,
        to: ticket.to_email,
        body: bodyContent,
        status: ticket.status,
        priority: ticket.priority || 'medium',
        category: ticket.category || 'general',
        date: normalizedDate,
        createdAt: createdTimestamp,
        updatedAt: updatedTimestamp,
        created_at: createdTimestamp,
        updated_at: updatedTimestamp,
        resolutionTime: ticket.resolution_time,
        resolution_time: ticket.resolution_time,
        closedAt: ticket.closed_at,
        closed_at: ticket.closed_at,
        isManual: Boolean(ticket.is_manual),
        is_manual: Boolean(ticket.is_manual),
        source: ticket.source || 'email',
        customerName: ticket.customer_name || null,
        customerId: ticket.customer_id || null,
        customerPhone: ticket.customer_phone || null,
        customerEmail: ticket.customer_email || ticket.from_email || null,
        customer_name: ticket.customer_name || null,
        customer_id: ticket.customer_id || null,
        customer_phone: ticket.customer_phone || null,
        customer_email: ticket.customer_email || ticket.from_email || null,
        message_id: ticket.message_id,
        email_id: ticket.email_id
    };
}

function normalizeTimestampValue(value, fallback = null) {
    if (!value) {
        return fallback;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return fallback;
    }
    return parsed.toISOString();
}

// Get all tickets
async function getTickets(limit = 100) {
    try {
        const supabase = getDatabase();
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);

        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .order('id', { ascending: false })
            .limit(safeLimit);

        if (error) {
            console.error('Error fetching tickets:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            return [];
        }

        const mappedTickets = data.map(mapTicketRecord);

        // Ensure newest tickets (by date) are shown first
        mappedTickets.sort((a, b) => {
            const aTime = a.date ? new Date(a.date).getTime() : 0;
            const bTime = b.date ? new Date(b.date).getTime() : 0;
            return bTime - aTime;
        });

        console.log('🎯 Loaded tickets count:', mappedTickets.length);

        return mappedTickets;
    } catch (error) {
        console.error('Error getting tickets:', error);
        throw error;
    }
}

// Update ticket status
async function updateTicketStatus(ticketId, status) {
    try {
        const supabase = getDatabase();

        console.log(`Updating ticket ${ticketId} to status ${status}`);

        // First, let's check if the ticket exists
        const { data: existingTicket, error: selectError } = await supabase
            .from('tickets')
            .select('id, status')
            .eq('id', ticketId)
            .single();

        if (selectError || !existingTicket) {
            console.log('Ticket not found!');
            return { success: false, error: 'Ticket not found' };
        }

        // Now update the ticket
        const { data, error: updateError } = await supabase
            .from('tickets')
            .update({
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', ticketId)
            .select('id, status, updated_at')
            .single();

        if (updateError) {
            console.error('Error updating ticket:', updateError);
            return { success: false, error: updateError.message };
        }

        console.log('After update:', data);

        return { success: true, updatedTicket: data };
    } catch (error) {
        console.error('Error updating ticket status:', error);
        return { success: false, error: error.message };
    }
}

// Generic update ticket function
async function updateTicket(ticketId, updates) {
    try {
        const supabase = getDatabase();

        console.log(`Updating ticket ${ticketId} with updates:`, updates);

        // Check if ticket exists first
        const { data: existingTicket, error: selectError } = await supabase
            .from('tickets')
            .select('id')
            .eq('id', ticketId)
            .single();

        if (selectError || !existingTicket) {
            console.log('Ticket not found!');
            return { success: false, error: 'Ticket not found' };
        }

        // Prepare update object
        const updateData = {
            updated_at: new Date().toISOString()
        };

        // Map the update fields
        if (updates.priority !== undefined) updateData.priority = updates.priority;
        if (updates.category !== undefined) updateData.category = updates.category;
        if (updates.status !== undefined) updateData.status = updates.status;
        if (updates.resolutionTime !== undefined) updateData.resolution_time = updates.resolutionTime;
        if (updates.closedAt !== undefined) updateData.closed_at = updates.closedAt;
        if (updates.customerName !== undefined) updateData.customer_name = updates.customerName;

        // Update the ticket
        const { data, error: updateError } = await supabase
            .from('tickets')
            .update(updateData)
            .eq('id', ticketId)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating ticket:', updateError);
            return { success: false, error: updateError.message };
        }

        console.log('Ticket updated successfully:', data);
        return { success: true, updatedTicket: data };
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