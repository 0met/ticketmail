// Get all tickets
async function getTickets(limit = 100) {
    try {
        const sql = getDatabase();

        // Get all tickets with all available columns
        const result = await sql
            SELECT
                id,
                email_id,
                subject,
                from_email,
                to_email,
                body_text,
                body_html,
                body,
                status,
                priority,
                labels,
                received_at,
                created_at,
                updated_at,
                resolved_at,
                ticket_number,
                category,
                resolution_time,
                closed_at
            FROM tickets
            ORDER BY 
                CASE 
                    WHEN received_at IS NOT NULL THEN received_at
                    ELSE created_at
                END DESC
            LIMIT ${limit}
        ;

        return result.map(ticket => ({
            id: ticket.id,
            ticketNumber: ticket.ticket_number || TK-2025-${ticket.id.toString().slice(-4).padStart(4, '0')},
            subject: ticket.subject || 'No Subject',
            from: ticket.from_email,
            to: ticket.to_email,
            body: ticket.body || ticket.body_text || '',
            status: ticket.status || 'new',
            category: ticket.category || 'general',
            priority: ticket.priority || 'medium',
            date: new Date(ticket.received_at || ticket.created_at),
            createdAt: ticket.created_at,
            updatedAt: ticket.updated_at,
            closedAt: ticket.closed_at,
            resolutionTime: ticket.resolution_time
        }));

    } catch (error) {
        console.error('Error getting tickets:', error);
        throw error;
    }
}
