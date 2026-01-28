const { getDatabase } = require('./lib/database-local');

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

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        const { userId } = JSON.parse(event.body);
        const sql = getDatabase();

        if (!userId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'User ID is required' })
            };
        }

        // Prevent deleting the last admin?
        // Check if user is admin
        const userToDelete = await sql`SELECT role FROM users WHERE id = ${userId}`;
        if (userToDelete.length > 0 && userToDelete[0].role === 'admin') {
            const adminCount = await sql`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`;
            if (adminCount[0].count <= 1) {
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: false, error: 'Cannot delete the last administrator' })
                };
            }
        }

        await sql`DELETE FROM users WHERE id = ${userId}`;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: true, message: 'User deleted successfully' })
        };

    } catch (error) {
        console.error('Delete user error:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: false, error: 'Internal server error' })
        };
    }
};
