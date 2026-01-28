const { createUser, logActivity } = require('./lib/auth');

function parseJsonBody(event) {
    const body = event && event.body;
    if (body == null) return null;
    if (typeof body === 'object') return body;

    const raw = String(body).trim();

    try {
        return JSON.parse(raw);
    } catch (e1) {
        try {
            let candidate = raw;
            if (candidate.startsWith('\\{"') || candidate.startsWith('\\[')) {
                candidate = candidate.slice(1);
            }
            candidate = candidate.replace(/\\"/g, '"');
            return JSON.parse(candidate);
        } catch {
            try {
                if (raw.startsWith('"') && raw.endsWith('"')) {
                    const unwrapped = raw.slice(1, -1).replace(/\\"/g, '"');
                    return JSON.parse(unwrapped);
                }
            } catch {
                // fall through
            }
            throw e1;
        }
    }
}

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
        const { email, fullName, role, password, createdBy, companyId, department, jobTitle, phone } = parseJsonBody(event) || {};

        // Validate required fields
        if (!email || !fullName || !role || !password) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Email, full name, role, and password are required' })
            };
        }

        // Validate role
        const validRoles = ['admin', 'agent', 'customer'];
        if (!validRoles.includes(role)) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Invalid role. Must be admin, agent, or customer' })
            };
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Invalid email format' })
            };
        }

        // Create user
        const userData = {
            email,
            fullName,
            role,
            password,
            companyId: companyId || null,
            department: department || null,
            jobTitle: jobTitle || null,
            phone: phone || null
        };

        const user = await createUser(userData);

        // Log the user creation
        await logActivity(createdBy || user.id, 'user_created', 'user', 
            { 
                createdUserEmail: email, 
                createdUserRole: role,
                createdBy: createdBy ? 'admin' : 'self_registration' 
            }, 
            event.headers['x-forwarded-for'] || event.headers['x-real-ip']
        );

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    role: user.role,
                    isActive: user.is_active,
                    createdAt: user.created_at
                },
                message: `${role.charAt(0).toUpperCase() + role.slice(1)} user created successfully`
            })
        };

    } catch (error) {
        console.error('Create user error:', error);
        
        // Handle duplicate email error
        if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
            return {
                statusCode: 409,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Email address already exists' })
            };
        }

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