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

        const supabase = getSupabaseClient();

        // Check if company exists
        const { data: existingCompany, error: existingError } = await supabase
            .from('companies')
            .select('id, name, domain, phone, address, industry, company_size, notes, is_active, created_at')
            .eq('id', id)
            .single();

        if (existingError && existingError.code !== 'PGRST116') {
            throw existingError;
        }

        if (!existingCompany) {
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
        const updates = {
            name: name !== undefined ? name : existingCompany.name,
            domain: domain !== undefined ? domain : existingCompany.domain,
            phone: phone !== undefined ? phone : existingCompany.phone,
            address: address !== undefined ? address : existingCompany.address,
            industry: industry !== undefined ? industry : existingCompany.industry,
            company_size: size !== undefined ? size : existingCompany.company_size,
            notes: notes !== undefined ? notes : existingCompany.notes,
            is_active: isActive !== undefined ? isActive : existingCompany.is_active,
            updated_at: new Date().toISOString()
        };

        const { data: updatedCompany, error: updateError } = await supabase
            .from('companies')
            .update(updates)
            .eq('id', id)
            .select('id, name, domain, phone, address, industry, company_size, notes, is_active, created_at, updated_at')
            .single();

        if (updateError) {
            throw updateError;
        }

        // Log activity
        await logActivity(
            sessionValidation.user.id, 
            'company_updated', 
            'company', 
            { companyId: id, companyName: updatedCompany.name }, 
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
                    id: updatedCompany.id,
                    name: updatedCompany.name,
                    domain: updatedCompany.domain,
                    phone: updatedCompany.phone,
                    address: updatedCompany.address,
                    industry: updatedCompany.industry,
                    size: updatedCompany.company_size,
                    notes: updatedCompany.notes,
                    isActive: !!updatedCompany.is_active,
                    createdAt: updatedCompany.created_at,
                    updatedAt: updatedCompany.updated_at
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
