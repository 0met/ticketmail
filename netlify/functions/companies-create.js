const { getDatabase } = require('./lib/database');
const { validateSession, logActivity } = require('./lib/auth');

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

        // Only admin can create companies
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

        const { name, domain, phone, address, industry, size, notes } = JSON.parse(event.body);

        // Validate required fields
        if (!name) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Company name is required' })
            };
        }

        const sql = getDatabase();

        // Check if company with same name already exists
        const existingCompany = await sql`
            SELECT id FROM companies WHERE name = ${name}
        `;

        if (existingCompany.length > 0) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Company with this name already exists' })
            };
        }

        // Create company
        const company = await sql`
            INSERT INTO companies (name, domain, phone, address, industry, company_size, notes)
            VALUES (${name}, ${domain || null}, ${phone || null}, ${address || null}, 
                    ${industry || null}, ${size || null}, ${notes || null})
            RETURNING id, name, domain, phone, address, industry, company_size, notes, is_active, created_at
        `;

        // Log activity
        await logActivity(
            sessionValidation.user.id, 
            'company_created', 
            'company', 
            { companyId: company[0].id, companyName: name }, 
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
                company: {
                    id: company[0].id,
                    name: company[0].name,
                    domain: company[0].domain,
                    phone: company[0].phone,
                    address: company[0].address,
                    industry: company[0].industry,
                    size: company[0].company_size,
                    notes: company[0].notes,
                    isActive: company[0].is_active,
                    createdAt: company[0].created_at
                }
            })
        };

    } catch (error) {
        console.error('Error creating company:', error);
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
