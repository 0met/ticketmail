const { validateSession } = require('./lib/auth');
const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
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
        // Validate session
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'No authorization token provided' })
            };
        }

        const token = authHeader.replace('Bearer ', '');
        const sessionValidation = await validateSession(token);
        
        if (!sessionValidation.valid) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Invalid session' })
            };
        }

        // Only admin can list companies (company management UI)
        if (sessionValidation.user.role !== 'admin') {
            return {
                statusCode: 403,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Insufficient permissions' })
            };
        }
        const supabase = getSupabaseClient();
        const params = event.queryStringParameters || {};
        const includeInactive = params.includeInactive === 'true';

        let companyQuery = supabase
            .from('companies')
            .select('id, name, domain, phone, address, industry, company_size, notes, is_active, created_at')
            .order('created_at', { ascending: false });

        if (!includeInactive) {
            companyQuery = companyQuery.eq('is_active', true);
        }

        const { data: companies, error: companiesError } = await companyQuery;
        if (companiesError) {
            throw companiesError;
        }

        const companyIds = (companies || []).map(c => c.id);

        const userCountByCompanyId = new Map();
        const ticketCountByCompanyId = new Map();

        if (companyIds.length > 0) {
            const { data: users, error: usersError } = await supabase
                .from('users')
                .select('id, company_id')
                .in('company_id', companyIds);

            if (usersError) {
                console.warn('Could not fetch company user counts:', usersError);
            } else {
                for (const u of users || []) {
                    const current = userCountByCompanyId.get(u.company_id) || 0;
                    userCountByCompanyId.set(u.company_id, current + 1);
                }
            }

            const { data: tickets, error: ticketsError } = await supabase
                .from('tickets')
                .select('id, company_id')
                .in('company_id', companyIds);

            if (ticketsError) {
                console.warn('Could not fetch company ticket counts:', ticketsError);
            } else {
                for (const t of tickets || []) {
                    const current = ticketCountByCompanyId.get(t.company_id) || 0;
                    ticketCountByCompanyId.set(t.company_id, current + 1);
                }
            }
        }

        const formattedCompanies = (companies || []).map(company => ({
            id: company.id,
            name: company.name,
            domain: company.domain,
            phone: company.phone,
            address: company.address,
            industry: company.industry,
            size: company.company_size,
            notes: company.notes,
            isActive: !!company.is_active,
            userCount: userCountByCompanyId.get(company.id) || 0,
            ticketCount: ticketCountByCompanyId.get(company.id) || 0,
            createdAt: company.created_at
        }));

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                companies: formattedCompanies,
                count: formattedCompanies.length
            })
        };

    } catch (error) {
        console.error('Error listing companies:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error',
                details: error.message
            })
        };
    }
};
