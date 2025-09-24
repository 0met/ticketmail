const { getDatabase } = require('./lib/database');
const crypto = require('crypto');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    try {
        const sql = getDatabase();
        const authHeader = event.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Authorization required'
                })
            };
        }

        const sessionToken = authHeader.substring(7);

        // Verify session and check if user is admin
        const session = await sql`
            SELECT u.id, u.username, u.is_admin 
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.session_token = ${sessionToken} 
            AND s.expires_at > CURRENT_TIMESTAMP
        `;

        if (session.length === 0) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid or expired session'
                })
            };
        }

        const user = session[0];

        if (!user.is_admin) {
            return {
                statusCode: 403,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Admin access required'
                })
            };
        }

        // Handle different HTTP methods
        switch (event.httpMethod) {
            case 'GET':
                // List all users
                const users = await sql`
                    SELECT id, username, is_admin, created_at, last_login, active
                    FROM users
                    ORDER BY created_at DESC
                `;
                
                return {
                    statusCode: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: true,
                        users: users
                    })
                };

            case 'POST':
                // Create new user
                const { username, password, isAdmin } = JSON.parse(event.body);
                
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

                // Check if username already exists
                const existingUser = await sql`
                    SELECT id FROM users WHERE username = ${username}
                `;

                if (existingUser.length > 0) {
                    return {
                        statusCode: 400,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            success: false,
                            error: 'Username already exists'
                        })
                    };
                }

                // Hash password
                const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

                // Create user
                const newUser = await sql`
                    INSERT INTO users (username, password_hash, is_admin)
                    VALUES (${username}, ${hashedPassword}, ${isAdmin || false})
                    RETURNING id, username, is_admin, created_at
                `;

                return {
                    statusCode: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: true,
                        message: 'User created successfully',
                        user: newUser[0]
                    })
                };

            case 'PUT':
                // Update user (admin status, active status)
                const { userId, updateData } = JSON.parse(event.body);
                
                if (!userId) {
                    return {
                        statusCode: 400,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            success: false,
                            error: 'User ID is required'
                        })
                    };
                }

                // Don't allow user to change their own admin status
                if (userId === user.id && 'isAdmin' in updateData) {
                    return {
                        statusCode: 400,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            success: false,
                            error: 'Cannot change your own admin status'
                        })
                    };
                }

                const updateFields = [];
                const updateValues = [];

                if ('isAdmin' in updateData) {
                    updateFields.push('is_admin = $' + (updateValues.length + 1));
                    updateValues.push(updateData.isAdmin);
                }

                if ('active' in updateData) {
                    updateFields.push('active = $' + (updateValues.length + 1));
                    updateValues.push(updateData.active);
                }

                if (updateFields.length === 0) {
                    return {
                        statusCode: 400,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            success: false,
                            error: 'No valid fields to update'
                        })
                    };
                }

                updateValues.push(userId);
                const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${updateValues.length} RETURNING id, username, is_admin, active`;

                const updatedUser = await sql.unsafe(updateQuery, updateValues);

                return {
                    statusCode: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: true,
                        message: 'User updated successfully',
                        user: updatedUser[0]
                    })
                };

            case 'DELETE':
                // Delete/deactivate user
                const { userId: deleteUserId } = JSON.parse(event.body);
                
                if (!deleteUserId) {
                    return {
                        statusCode: 400,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            success: false,
                            error: 'User ID is required'
                        })
                    };
                }

                // Don't allow user to delete themselves
                if (deleteUserId === user.id) {
                    return {
                        statusCode: 400,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            success: false,
                            error: 'Cannot delete your own account'
                        })
                    };
                }

                // Deactivate user instead of deleting
                await sql`
                    UPDATE users 
                    SET active = FALSE 
                    WHERE id = ${deleteUserId}
                `;

                // Invalidate their sessions
                await sql`
                    DELETE FROM user_sessions 
                    WHERE user_id = ${deleteUserId}
                `;

                return {
                    statusCode: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: true,
                        message: 'User deactivated successfully'
                    })
                };

            default:
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

    } catch (error) {
        console.error('User management error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error: ' + error.message
            })
        };
    }
};