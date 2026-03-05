const { getUserSettings, saveUserSettings } = require('./lib/database');

exports.handler = async (event, context) => {
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

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed. Use POST.'
            })
        };
    }

    try {
        // Parse request body
        const settings = JSON.parse(event.body);

        // Validate required fields
        if (!settings.gmailAddress) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Gmail address is required'
                })
            };
        }

        // App password is only required on initial setup.
        // If omitted, preserve the existing one in the database.
        if (!settings.appPassword) {
            const existing = await getUserSettings();
            if (!existing || !existing.appPassword) {
                return {
                    statusCode: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: false,
                        error: 'App password is required for initial setup'
                    })
                };
            }
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(settings.gmailAddress)) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid email address format'
                })
            };
        }

        // Optional fields (kept for backward compatibility)
        // UI no longer relies on these when server-side scheduled sync is enabled.
        const refreshInterval = Number.isFinite(parseInt(settings.refreshInterval))
            ? parseInt(settings.refreshInterval)
            : 15;

        const validStatuses = ['new', 'open', 'pending', 'closed'];
        const defaultStatus = validStatuses.includes(settings.defaultStatus)
            ? settings.defaultStatus
            : 'new';

        // Save settings to database
        try {
            await saveUserSettings({
                gmailAddress: settings.gmailAddress,
                appPassword: settings.appPassword,
                refreshInterval: refreshInterval,
                defaultStatus: defaultStatus
            });
        } catch (dbError) {
            console.error('Database error saving settings:', dbError);
            
            // Check if it's a table not found error
            if (dbError.message.includes('relation "user_settings" does not exist')) {
                return {
                    statusCode: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: false,
                        error: 'User settings table does not exist. Please initialize the database first.',
                        hint: 'Contact administrator or visit /.netlify/functions/init-settings-table'
                    })
                };
            }
            
            throw dbError; // Re-throw other errors
        }

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Settings saved successfully'
            })
        };

    } catch (error) {
        console.error('Error in settings-update function:', error);
        console.error('Error stack:', error.stack);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error: ' + error.message,
                details: error.stack,
                timestamp: new Date().toISOString()
            })
        };
    }
};