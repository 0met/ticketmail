const { createUser, logActivity } = require('./lib/auth');

function parseJsonBody(event) {
    const body = event && event.body;
    if (body == null) return null;
    if (typeof body === 'object') return body;

    let raw = String(body);
    // Netlify may send base64-encoded bodies
    if (event && event.isBase64Encoded) {
        try {
            raw = Buffer.from(raw, 'base64').toString('utf8');
        } catch {
            // ignore, fall back to raw
        }
    }

    raw = raw.trim();

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
        const parsed = parseJsonBody(event) || {};

        // Accept a few aliases (older UI / different clients)
        const email = parsed.email ?? parsed.userEmail ?? parsed.username ?? null;
        const fullName = parsed.fullName ?? parsed.full_name ?? parsed.name ?? parsed.userFullName ?? null;
        const role = parsed.role ?? parsed.userRole ?? null;
        const password = parsed.password ?? parsed.userPassword ?? null;
        const createdBy = parsed.createdBy ?? parsed.created_by ?? null;
        const companyId = parsed.companyId ?? parsed.company_id ?? null;
        const department = parsed.department ?? null;
        const jobTitle = parsed.jobTitle ?? parsed.job_title ?? null;
        const phone = parsed.phone ?? null;

        // Validate required fields
        if (!email || !fullName || !role || !password) {
            const missing = [
                !email ? 'email' : null,
                !fullName ? 'fullName' : null,
                !role ? 'role' : null,
                !password ? 'password' : null
            ].filter(Boolean);
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Email, full name, role, and password are required',
                    missing,
                    debug: {
                        bodyType: typeof (event && event.body),
                        isBase64Encoded: !!(event && event.isBase64Encoded),
                        parsedKeys: Object.keys(parsed || {}).filter(k => k !== 'password' && k !== 'userPassword')
                    }
                })
            };
        }

        // Validate role
        let normalizedRole = String(role || '').trim().toLowerCase();
        if (normalizedRole === 'superuser' || normalizedRole === 'super-user' || normalizedRole === 'super user') {
            normalizedRole = 'super_user';
        }
        const validRoles = ['admin', 'super_user', 'agent', 'customer'];
        if (!validRoles.includes(normalizedRole)) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Invalid role. Must be admin, super_user, agent, or customer' })
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
            role: normalizedRole,
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