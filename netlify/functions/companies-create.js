const { validateSession, logActivity } = require('./lib/auth');
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

        const supabase = getSupabaseClient();

        // Check if company with same name already exists
        const { data: existingCompany, error: existingError } = await supabase
            .from('companies')
            .select('id')
            .eq('name', name)
            .limit(1);

        if (existingError) {
            throw existingError;
        }

        if ((existingCompany || []).length > 0) {
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
        const { data: company, error: insertError } = await supabase
            .from('companies')
            .insert({
                name,
                domain: domain || null,
                phone: phone || null,
                address: address || null,
                industry: industry || null,
                company_size: size || null,
                notes: notes || null,
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select('id, name, domain, phone, address, industry, company_size, notes, is_active, created_at')
            .single();

        if (insertError) {
            throw insertError;
        }

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
                    id: company.id,
                    name: company.name,
                    domain: company.domain,
                    phone: company.phone,
                    address: company.address,
                    industry: company.industry,
                    size: company.company_size,
                    notes: company.notes,
                    isActive: !!company.is_active,
                    createdAt: company.created_at
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
