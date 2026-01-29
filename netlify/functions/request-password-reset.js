const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Generate password reset token
function generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
}

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
        const { email } = JSON.parse(event.body);

        if (!email) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'Email is required' })
            };
        }

        // Check if user exists
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, full_name')
            .eq('email', email)
            .single();

        if (userError || !user) {
            // Don't reveal if user exists or not for security
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    success: true,
                    message: 'If an account with that email exists, a password reset link has been sent.'
                })
            };
        }

        // Generate reset token and expiry (24 hours)
        const resetToken = generateResetToken();
        const resetExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Store reset token in database (you might want to add a reset_tokens table)
        // For now, we'll store it in the user's metadata
        const { error: updateError } = await supabase
            .from('users')
            .update({
                profile_data: {
                    passwordResetToken: resetToken,
                    passwordResetExpiry: resetExpiry.toISOString()
                },
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

        if (updateError) {
            throw updateError;
        }

        // In a real application, you would send an email here
        // For now, we'll just return the reset token for testing
        console.log(`Password reset token for ${email}: ${resetToken}`);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.',
                // Remove this in production - only for testing
                resetToken: resetToken,
                resetUrl: `${process.env.URL || 'http://localhost:8888'}/reset-password?token=${resetToken}`
            })
        };
    } catch (error) {
        console.error('Error requesting password reset:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Internal server error' })
        };
    }
};