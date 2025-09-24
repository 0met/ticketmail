const { getDatabase } = require('./lib/database');
const crypto = require('crypto');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

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
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed'
            })
        };
    }

    try {
        const { username, password } = JSON.parse(event.body);

        if (!username || !password) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Username and password are required'
                })
            };
        }

        const sql = getDatabase();

        // Create users table if it doesn't exist
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                active BOOLEAN DEFAULT TRUE
            )
        `;

        // Check if any users exist
        const userCount = await sql`SELECT COUNT(*) as count FROM users`;
        
        if (userCount[0].count > 0) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Admin user already exists. Please login.'
                })
            };
        }

        // Hash password
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

        // Create first admin user
        const newUser = await sql`
            INSERT INTO users (username, password_hash, is_admin)
            VALUES (${username}, ${hashedPassword}, TRUE)
            RETURNING id, username, is_admin
        `;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Admin user created successfully',
                user: {
                    id: newUser[0].id,
                    username: newUser[0].username,
                    isAdmin: newUser[0].is_admin
                }
            })
        };

    } catch (error) {
        console.error('Create admin error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Failed to create admin user: ' + error.message
            })
        };
    }
};