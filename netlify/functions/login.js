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

        // Check if this is the first user (make them admin)
        const userCount = await sql`SELECT COUNT(*) as count FROM users`;
        const isFirstUser = userCount[0].count === 0;

        // Check if user exists
        const existingUser = await sql`
            SELECT id, username, password_hash, is_admin, active 
            FROM users 
            WHERE username = ${username} AND active = TRUE
        `;

        if (existingUser.length === 0) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid username or password'
                })
            };
        }

        const user = existingUser[0];

        // Verify password
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        
        if (user.password_hash !== hashedPassword) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid username or password'
                })
            };
        }

        // Update last login
        await sql`
            UPDATE users 
            SET last_login = CURRENT_TIMESTAMP 
            WHERE id = ${user.id}
        `;

        // Generate session token
        const sessionToken = crypto.randomBytes(32).toString('hex');
        
        // Store session (create sessions table if needed)
        await sql`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                session_token VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
            )
        `;

        // Clean up old sessions
        await sql`DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP`;

        // Create new session
        await sql`
            INSERT INTO user_sessions (user_id, session_token)
            VALUES (${user.id}, ${sessionToken})
        `;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                sessionToken: sessionToken,
                user: {
                    id: user.id,
                    username: user.username,
                    isAdmin: user.is_admin
                }
            })
        };

    } catch (error) {
        console.error('Login error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error'
            })
        };
    }
};