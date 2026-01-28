const { getDatabase } = require('./lib/database');
const { validateSession } = require('./lib/auth');

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

        const sql = getDatabase();
        const params = event.queryStringParameters || {};
        const includeInactive = params.includeInactive === 'true';

        // Get companies with user counts
        let companies;
        if (includeInactive) {
            companies = await sql`
                SELECT 
                    c.id, c.name, c.domain, c.phone, c.address, c.industry, 
                    c.company_size, c.notes, c.is_active, c.created_at,
                    COUNT(DISTINCT u.id) as user_count,
                    COUNT(DISTINCT t.id) as ticket_count
                FROM companies c
                LEFT JOIN users u ON u.company_id = c.id
                LEFT JOIN tickets t ON t.company_id = c.id
                GROUP BY c.id
                ORDER BY c.created_at DESC
            `;
        } else {
            companies = await sql`
                SELECT 
                    c.id, c.name, c.domain, c.phone, c.address, c.industry, 
                    c.company_size, c.notes, c.is_active, c.created_at,
                    COUNT(DISTINCT u.id) as user_count,
                    COUNT(DISTINCT t.id) as ticket_count
                FROM companies c
                LEFT JOIN users u ON u.company_id = c.id
                LEFT JOIN tickets t ON t.company_id = c.id
                WHERE c.is_active = true
                GROUP BY c.id
                ORDER BY c.created_at DESC
            `;
        }

        const formattedCompanies = companies.map(company => ({
            id: company.id,
            name: company.name,
            domain: company.domain,
            phone: company.phone,
            address: company.address,
            industry: company.industry,
            size: company.company_size,
            notes: company.notes,
            isActive: company.is_active,
            userCount: parseInt(company.user_count) || 0,
            ticketCount: parseInt(company.ticket_count) || 0,
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
