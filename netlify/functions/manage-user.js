const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event, context) => {
    // Handle CORS
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
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    try {
        const { userId, action, ...updateData } = JSON.parse(event.body);

        if (!userId || !action) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'User ID and action are required' })
            };
        }

        let updateFields = {
            updated_at: new Date().toISOString()
        };

        // Handle different actions
        switch (action) {
            case 'lock':
                updateFields.is_active = false;
                break;
            case 'unlock':
                updateFields.is_active = true;
                break;
            case 'update_role':
                if (!updateData.role) {
                    return {
                        statusCode: 400,
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({ success: false, error: 'Role is required for update_role action' })
                    };
                }
                updateFields.role = updateData.role;
                break;
            case 'update_profile':
                if (updateData.fullName) updateFields.full_name = updateData.fullName;
                if (updateData.company) updateFields.company = updateData.company;
                if (updateData.department) updateFields.department = updateData.department;
                if (updateData.jobTitle) updateFields.job_title = updateData.jobTitle;
                if (updateData.phone) updateFields.phone = updateData.phone;
                break;
            default:
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ success: false, error: 'Invalid action' })
                };
        }

        // Update user
        const { data: updatedUser, error } = await supabase
            .from('users')
            .update(updateFields)
            .eq('id', userId)
            .select('id, email, full_name, role, is_active, updated_at')
            .single();

        if (error) {
            throw error;
        }

        // Log the action
        await supabase
            .from('activity_log')
            .insert({
                user_id: userId,
                action: `user_${action}`,
                resource_type: 'user',
                resource_id: userId.toString(),
                details: { performed_by: updateData.performedBy || 'system', changes: updateFields },
                created_at: new Date().toISOString()
            });

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                user: updatedUser,
                message: `User ${action} completed successfully`
            })
        };
    } catch (error) {
        console.error('Error managing user:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Internal server error' })
        };
    }
};