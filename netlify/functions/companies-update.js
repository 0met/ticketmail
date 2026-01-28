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
                'Access-Control-Allow-Methods': 'PUT, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'PUT') {
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

        // Only admin can update companies
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

        const { id, name, domain, phone, address, industry, size, notes, isActive } = JSON.parse(event.body);

        if (!id) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Company ID is required' })
            };
        }

        const sql = getDatabase();

        // Check if company exists
        const existingCompany = await sql`
            SELECT id FROM companies WHERE id = ${id}
        `;

        if (existingCompany.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ success: false, error: 'Company not found' })
            };
        }

        // Update company
        const updatedCompany = await sql`
            UPDATE companies 
            SET 
                name = ${name !== undefined ? name : existingCompany[0].name},
                domain = ${domain !== undefined ? domain : existingCompany[0].domain},
                phone = ${phone !== undefined ? phone : existingCompany[0].phone},
                address = ${address !== undefined ? address : existingCompany[0].address},
                industry = ${industry !== undefined ? industry : existingCompany[0].industry},
                company_size = ${size !== undefined ? size : existingCompany[0].company_size},
                notes = ${notes !== undefined ? notes : existingCompany[0].notes},
                is_active = ${isActive !== undefined ? isActive : existingCompany[0].is_active},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${id}
            RETURNING id, name, domain, phone, address, industry, company_size, notes, is_active, created_at, updated_at
        `;

        // Log activity
        await logActivity(
            sessionValidation.user.id, 
            'company_updated', 
            'company', 
            { companyId: id, companyName: updatedCompany[0].name }, 
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
                    id: updatedCompany[0].id,
                    name: updatedCompany[0].name,
                    domain: updatedCompany[0].domain,
                    phone: updatedCompany[0].phone,
                    address: updatedCompany[0].address,
                    industry: updatedCompany[0].industry,
                    size: updatedCompany[0].company_size,
                    notes: updatedCompany[0].notes,
                    isActive: updatedCompany[0].is_active,
                    createdAt: updatedCompany[0].created_at,
                    updatedAt: updatedCompany[0].updated_at
                }
            })
        };

    } catch (error) {
        console.error('Error updating company:', error);
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
