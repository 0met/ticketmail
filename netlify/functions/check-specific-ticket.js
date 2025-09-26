const { getDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    try {
        const sql = getDatabase();
        
        const ticketId = '0d434bbb-6bc8-4f17-b18b-b3ed80866e47';
        
        const tickets = await sql`
            SELECT * FROM tickets WHERE id = ${ticketId}
        `;
        
        if (tickets.length === 0) {
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Ticket not found'
                })
            };
        }
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            },
            body: JSON.stringify({
                success: true,
                ticket: tickets[0]
            })
        };
        
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            },
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};