const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getSupabaseClient() {
    if (supabase) return supabase;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        const missing = [!supabaseUrl ? 'SUPABASE_URL' : null, !supabaseServiceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null]
            .filter(Boolean)
            .join(', ');
        const error = new Error(`Missing required environment variable(s): ${missing}`);
        error.code = 'MISSING_SUPABASE_ENV';
        throw error;
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    return supabase;
}

// Generate unique ticket number
function generateTicketNumber() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `TICK-${timestamp}-${random}`;
}

// Ticket management functions
async function createTicket(ticketData) {
    try {
        const supabase = getSupabaseClient();
        const ticketNumber = generateTicketNumber();

        const ticket = {
            ticket_number: ticketNumber,
            title: ticketData.title,
            description: ticketData.description,
            status: ticketData.status || 'open',
            priority: ticketData.priority || 'medium',
            category: ticketData.category,
            created_by: ticketData.createdBy,
            assigned_to: ticketData.assignedTo,
            customer_name: ticketData.customerName,
            customer_email: ticketData.customerEmail,
            customer_company: ticketData.customerCompany,
            customer_phone: ticketData.customerPhone,
            tags: ticketData.tags || [],
            attachments: ticketData.attachments || {},
            metadata: ticketData.metadata || {}
        };

        const { data, error } = await supabase
            .from('tickets')
            .insert(ticket)
            .select()
            .single();

        if (error) {
            throw error;
        }

        return { success: true, ticket: data };
    } catch (error) {
        console.error('Error creating ticket:', error);
        return { success: false, error: error.message };
    }
}

async function getTickets(filters = {}) {
    try {
        const supabase = getSupabaseClient();
        let query = supabase
            .from('tickets')
            .select(`
                *,
                created_by_user:users!created_by(id, email, full_name),
                assigned_to_user:users!assigned_to(id, email, full_name)
            `)
            .order('created_at', { ascending: false });

        // Apply filters
        if (filters.status) {
            query = query.eq('status', filters.status);
        }
        if (filters.priority) {
            query = query.eq('priority', filters.priority);
        }
        if (filters.assigned_to) {
            query = query.eq('assigned_to', filters.assigned_to);
        }
        if (filters.created_by) {
            query = query.eq('created_by', filters.created_by);
        }
        if (filters.limit) {
            query = query.limit(filters.limit);
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        return { success: true, tickets: data };
    } catch (error) {
        console.error('Error getting tickets:', error);
        return { success: false, error: error.message };
    }
}

async function getTicketByNumber(ticketNumber) {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('tickets')
            .select(`
                *,
                created_by_user:users!created_by(id, email, full_name),
                assigned_to_user:users!assigned_to(id, email, full_name)
            `)
            .eq('ticket_number', ticketNumber)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        return { success: true, ticket: data };
    } catch (error) {
        console.error('Error getting ticket:', error);
        return { success: false, error: error.message };
    }
}

async function updateTicket(ticketNumber, updates) {
    try {
        const supabase = getSupabaseClient();
        const updateData = {
            ...updates,
            updated_at: new Date().toISOString()
        };

        // If status is being changed to closed, set closed_at
        if (updates.status === 'closed' && !updates.closed_at) {
            updateData.closed_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('tickets')
            .update(updateData)
            .eq('ticket_number', ticketNumber)
            .select()
            .single();

        if (error) {
            throw error;
        }

        return { success: true, ticket: data };
    } catch (error) {
        console.error('Error updating ticket:', error);
        return { success: false, error: error.message };
    }
}

async function deleteTicket(ticketNumber) {
    try {
        const supabase = getSupabaseClient();
        const { error } = await supabase
            .from('tickets')
            .delete()
            .eq('ticket_number', ticketNumber);

        if (error) {
            throw error;
        }

        return { success: true };
    } catch (error) {
        console.error('Error deleting ticket:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    createTicket,
    getTickets,
    getTicketByNumber,
    updateTicket,
    deleteTicket,
    generateTicketNumber
};