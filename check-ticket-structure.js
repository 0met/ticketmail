const { getDatabase } = require('./netlify/functions/lib/database-local');

async function checkTicketStructure() {
    const sql = getDatabase();
    const tickets = await sql`SELECT id, subject, status, created_at, from_email FROM tickets LIMIT 3`;
    console.log('Sample ticket objects:');
    tickets.forEach((ticket, i) => {
        console.log(`Ticket ${i+1}:`, JSON.stringify(ticket, null, 2));
    });
}

checkTicketStructure().catch(console.error);