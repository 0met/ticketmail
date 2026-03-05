const { getTickets, getDatabase } = require('./lib/database');
const { validateSession } = require('./lib/auth');

function getBearerToken(headers) {
    const authHeader = (headers && (headers.authorization || headers.Authorization)) || null;
    if (!authHeader) return null;
    const raw = String(authHeader).trim();
    if (raw.toLowerCase().startsWith('bearer ')) {
        return raw.slice('bearer '.length).trim();
    }
    return raw;
}

function normalizeRole(role) {
    const r = String(role || '').trim().toLowerCase();
    if (r === 'superuser' || r === 'super-user' || r === 'super user') return 'super_user';
    return r || 'customer';
}

async function getUserCompanyId(userId) {
    const supabase = getDatabase();
    const { data, error } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', userId)
        .single();

    if (error) {
        // If users table isn't available for some reason, default to no company restriction.
        console.warn('Could not load user company_id:', error.message || error);
        return null;
    }

    return data ? (data.company_id ?? null) : null;
}

function filterTicketsForViewer({ tickets, role, companyId }) {
    const safeTickets = Array.isArray(tickets) ? tickets : [];
    const normalizedRole = normalizeRole(role);
    const viewerCompanyId = companyId == null ? null : String(companyId);

    if (normalizedRole === 'admin' || normalizedRole === 'super_user') {
        return safeTickets;
    }

    if (normalizedRole === 'agent') {
        // Agents can be "locked" to a company by setting users.company_id.
        if (!viewerCompanyId) return safeTickets;
        return safeTickets.filter(t => String(t.company_id ?? t.companyId ?? '') === viewerCompanyId);
    }

    // Customers only see their company tickets.
    if (!viewerCompanyId) return [];
    return safeTickets.filter(t => String(t.company_id ?? t.companyId ?? '') === viewerCompanyId);
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

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed. Use GET.'
            })
        };
    }

    try {
        // Auth required
        const token = getBearerToken(event.headers || {});
        if (!token) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Unauthorized' })
            };
        }

        const session = await validateSession(token);
        if (!session.valid) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: session.error || 'Invalid session' })
            };
        }

        // Get query parameters
        const params = event.queryStringParameters || {};
        const limit = parseInt(params.limit) || 100;
        const status = params.status; // Optional status filter

        // Validate limit
        if (limit < 1 || limit > 1000) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Limit must be between 1 and 1000'
                })
            };
        }

        const viewerRole = normalizeRole(session.user && session.user.role);
        const viewerCompanyIdFromSession = session.user ? (session.user.company_id ?? session.user.companyId ?? null) : null;
        const viewerCompanyId = viewerCompanyIdFromSession != null
            ? viewerCompanyIdFromSession
            : await getUserCompanyId(session.user && session.user.id);

        // Load tickets from database (then filter server-side)
        const tickets = await getTickets(limit);

        // Filter by status if provided
        let filteredTickets = tickets;
        if (status) {
            const validStatuses = ['new', 'open', 'pending', 'closed'];
            if (!validStatuses.includes(status)) {
                return {
                    statusCode: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
                    })
                };
            }
            filteredTickets = tickets.filter(ticket => ticket.status === status);
        }

        // Apply visibility rules
        filteredTickets = filterTicketsForViewer({
            tickets: filteredTickets,
            role: viewerRole,
            companyId: viewerCompanyId
        });

        // Calculate statistics (visible set)
        const stats = {
            total: filteredTickets.length,
            new: filteredTickets.filter(t => t.status === 'new').length,
            open: filteredTickets.filter(t => t.status === 'open').length,
            pending: filteredTickets.filter(t => t.status === 'pending').length,
            closed: filteredTickets.filter(t => t.status === 'closed').length
        };

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                tickets: filteredTickets,
                stats: stats,
                count: filteredTickets.length,
                viewer: {
                    role: viewerRole,
                    companyId: viewerCompanyId
                }
            })
        };

    } catch (error) {
        console.error('Error in tickets-load function:', error);

        const msg = String(error && error.message ? error.message : error);
        const lower = msg.toLowerCase();
        const isMissingTable =
            lower.includes("could not find the table 'public.tickets'") ||
            (lower.includes('tickets') && lower.includes('schema cache')) ||
            lower.includes('relation "tickets" does not exist') ||
            lower.includes('relation tickets does not exist');

        if (isMissingTable) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Tickets table does not exist in Supabase yet. Initialize the tickets table first, then reload.',
                    hint: 'Visit /.netlify/functions/init-tickets-table (requires SUPABASE_DB_URL configured) OR create the tickets table in Supabase SQL editor.'
                })
            };
        }
        
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