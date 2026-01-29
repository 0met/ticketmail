const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Hash password
async function hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
}

exports.handler = async (event, context) => {
    // Handle CORS
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
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        const userData = JSON.parse(event.body);

        // Validate required fields
        if (!userData.email || !userData.password || !userData.fullName) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'Email, password, and full name are required' })
            };
        }

        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', userData.email)
            .single();

        if (existingUser) {
            return {
                statusCode: 409,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'User with this email already exists' })
            };
        }

        // Hash password
        const passwordHash = await hashPassword(userData.password);

        // Create user
        const { data: newUser, error } = await supabase
            .from('users')
            .insert({
                email: userData.email,
                password_hash: passwordHash,
                full_name: userData.fullName,
                role: userData.role || 'customer',
                company: userData.company,
                department: userData.department,
                job_title: userData.jobTitle,
                phone: userData.phone,
                is_active: userData.isActive !== false, // Default to true
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        // Log user creation
        await supabase
            .from('activity_log')
            .insert({
                user_id: newUser.id,
                action: 'user_created',
                resource_type: 'user',
                resource_id: newUser.id.toString(),
                details: { created_by: userData.createdBy || 'system' },
                created_at: new Date().toISOString()
            });

        return {
            statusCode: 201,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                user: {
                    id: newUser.id,
                    email: newUser.email,
                    fullName: newUser.full_name,
                    role: newUser.role,
                    isActive: newUser.is_active,
                    createdAt: newUser.created_at
                },
                message: 'User created successfully'
            })
        };
    } catch (error) {
        console.error('Error creating user:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Internal server error' })
        };
    }
};