const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        const missing = [!url ? 'SUPABASE_URL' : null, !key ? 'SUPABASE_SERVICE_ROLE_KEY' : null].filter(Boolean);
        const err = new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
        err.code = 'MISSING_SUPABASE_ENV';
        throw err;
    }

    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

function getBearerToken(headers) {
    const authHeader = headers.authorization || headers.Authorization;
    if (!authHeader) return null;
    return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : authHeader;
}

async function validateAdminSession(sessionToken) {
    const supabase = getSupabaseClient();

    const { data: session, error } = await supabase
        .from('sessions')
        .select(`
            session_token,
            user_id,
            expires_at,
            users!inner(id, email, full_name, role, is_active)
        `)
        .eq('session_token', sessionToken)
        .gt('expires_at', new Date().toISOString())
        .single();

    if (error || !session) {
        return { valid: false, error: 'Invalid or expired session' };
    }

    if (!session.users || !session.users.is_active) {
        return { valid: false, error: 'User account is not active' };
    }

    if (session.users.role !== 'admin') {
        return { valid: false, error: 'Insufficient permissions', statusCode: 403 };
    }

    return {
        valid: true,
        user: {
            id: session.users.id,
            email: session.users.email,
            fullName: session.users.full_name,
            role: session.users.role
        }
    };
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
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
        // Validate session (admin only)
        const token = getBearerToken(event.headers || {});
        if (!token) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'No authorization token provided' })
            };
        }

        const sessionValidation = await validateAdminSession(token);
        if (!sessionValidation.valid) {
            return {
                statusCode: sessionValidation.statusCode || 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: sessionValidation.error || 'Invalid session' })
            };
        }

        const supabase = getSupabaseClient();

        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, email, full_name, role, is_active, created_at, last_login, company_id, department, job_title, phone')
            .order('created_at', { ascending: false });

        if (usersError) {
            throw usersError;
        }

        const userIds = (users || []).map(u => u.id);
        const companyIds = [...new Set((users || []).map(u => u.company_id).filter(Boolean))];

        // Companies lookup
        const companiesById = new Map();
        if (companyIds.length > 0) {
            const { data: companies, error: companiesError } = await supabase
                .from('companies')
                .select('id, name, domain')
                .in('id', companyIds);

            if (companiesError) {
                console.warn('Could not fetch companies:', companiesError);
            } else {
                (companies || []).forEach(c => companiesById.set(c.id, c));
            }
        }

        // Activity stats lookup
        const activityCountByUserId = new Map();
        const lastActivityByUserId = new Map();
        if (userIds.length > 0) {
            const { data: activityRows, error: activityError } = await supabase
                .from('activity_log')
                .select('user_id, created_at')
                .in('user_id', userIds);

            if (activityError) {
                console.warn('Could not fetch activity stats:', activityError);
            } else {
                for (const row of activityRows || []) {
                    const current = activityCountByUserId.get(row.user_id) || 0;
                    activityCountByUserId.set(row.user_id, current + 1);

                    const prev = lastActivityByUserId.get(row.user_id);
                    if (!prev || new Date(row.created_at) > new Date(prev)) {
                        lastActivityByUserId.set(row.user_id, row.created_at);
                    }
                }
            }
        }

        // Permission counts lookup
        const permissionCountByUserId = new Map();
        if (userIds.length > 0) {
            const { data: permRows, error: permError } = await supabase
                .from('permissions')
                .select('user_id')
                .in('user_id', userIds);

            if (permError) {
                console.warn('Could not fetch permission counts:', permError);
            } else {
                for (const row of permRows || []) {
                    const current = permissionCountByUserId.get(row.user_id) || 0;
                    permissionCountByUserId.set(row.user_id, current + 1);
                }
            }
        }

        // Open ticket counts lookup
        const openTicketCountByUserId = new Map();
        if (userIds.length > 0) {
            const { data: openTickets, error: ticketsError } = await supabase
                .from('tickets')
                .select('assigned_to, status')
                .in('assigned_to', userIds)
                .neq('status', 'closed');

            if (ticketsError) {
                console.warn('Could not fetch open ticket counts:', ticketsError);
            } else {
                for (const t of openTickets || []) {
                    const current = openTicketCountByUserId.get(t.assigned_to) || 0;
                    openTicketCountByUserId.set(t.assigned_to, current + 1);
                }
            }
        }

        const usersWithStats = (users || []).map(user => {
            const company = user.company_id ? companiesById.get(user.company_id) : null;

            return {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role,
                isActive: !!user.is_active,
                createdAt: user.created_at,
                lastLogin: user.last_login,
                companyId: user.company_id,
                companyName: company ? company.name : null,
                companyDomain: company ? company.domain : null,
                department: user.department,
                jobTitle: user.job_title,
                phone: user.phone,
                permissionCount: permissionCountByUserId.get(user.id) || 0,
                openTicketCount: openTicketCountByUserId.get(user.id) || 0,
                activityCount: activityCountByUserId.get(user.id) || 0,
                lastActivity: lastActivityByUserId.get(user.id) || null
            };
        });

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                users: usersWithStats,
                total: (users || []).length,
                roles: {
                    admin: (users || []).filter(u => u.role === 'admin').length,
                    agent: (users || []).filter(u => u.role === 'agent').length,
                    customer: (users || []).filter(u => u.role === 'customer').length
                }
            })
        };

    } catch (error) {
        console.error('List users error:', error);

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