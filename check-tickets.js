const { getDatabase } = require('./netlify/functions/lib/database-local');

async function checkTickets() {
    const sql = getDatabase();
    const tickets = await sql`SELECT id, subject, status, created_at, from_email FROM tickets ORDER BY created_at DESC LIMIT 20`;
    console.log('Tickets in database:', tickets.length);
    tickets.forEach(ticket => {
        console.log(`- ID: ${ticket.id}, Subject: ${ticket.subject}, Status: ${ticket.status}, From: ${ticket.from_email}, Created: ${ticket.created_at}`);
    });
}

checkTickets().catch(console.error);