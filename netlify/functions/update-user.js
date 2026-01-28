const { getDatabase } = require('./lib/database-local');
const bcrypt = require('bcryptjs');

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
        const { userId, fullName, role, isActive, password, companyId, department, jobTitle, phone } = JSON.parse(event.body);
        const sql = getDatabase();

        if (!userId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'User ID is required' })
            };
        }

        // Check if user exists
        const existingUsers = await sql`SELECT id FROM users WHERE id = ${userId}`;
        if (existingUsers.length === 0) {
            return {
                statusCode: 404,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, error: 'User not found' })
            };
        }

        // Update fields
        if (fullName) {
            await sql`UPDATE users SET full_name = ${fullName} WHERE id = ${userId}`;
        }
        if (role) {
            await sql`UPDATE users SET role = ${role} WHERE id = ${userId}`;
        }
        if (typeof isActive === 'boolean') {
            await sql`UPDATE users SET is_active = ${isActive ? 1 : 0} WHERE id = ${userId}`;
        }
        if (password) {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${userId}`;
        }
        if (companyId !== undefined) {
            await sql`UPDATE users SET company_id = ${companyId} WHERE id = ${userId}`;
        }
        if (department !== undefined) {
            await sql`UPDATE users SET department = ${department} WHERE id = ${userId}`;
        }
        if (jobTitle !== undefined) {
            await sql`UPDATE users SET job_title = ${jobTitle} WHERE id = ${userId}`;
        }
        if (phone !== undefined) {
            await sql`UPDATE users SET phone = ${phone} WHERE id = ${userId}`;
        }

        await sql`UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ${userId}`;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: true, message: 'User updated successfully' })
        };

    } catch (error) {
        console.error('Update user error:', error);
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
