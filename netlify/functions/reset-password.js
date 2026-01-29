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
        const { token, newPassword } = JSON.parse(event.body);

        if (!token || !newPassword) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'Token and new password are required' })
            };
        }

        // Validate password strength
        if (newPassword.length < 8) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'Password must be at least 8 characters long' })
            };
        }

        // Find user with valid reset token
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, profile_data')
            .eq('profile_data->>passwordResetToken', token)
            .single();

        if (userError || !user) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'Invalid or expired reset token' })
            };
        }

        // Check if token is expired
        const resetExpiry = new Date(user.profile_data.passwordResetExpiry);
        if (resetExpiry < new Date()) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'Reset token has expired' })
            };
        }

        // Hash new password
        const passwordHash = await hashPassword(newPassword);

        // Update password and clear reset token
        const { error: updateError } = await supabase
            .from('users')
            .update({
                password_hash: passwordHash,
                profile_data: {
                    ...user.profile_data,
                    passwordResetToken: null,
                    passwordResetExpiry: null
                },
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

        if (updateError) {
            throw updateError;
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                message: 'Password has been reset successfully'
            })
        };
    } catch (error) {
        console.error('Error resetting password:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Internal server error' })
        };
    }
};