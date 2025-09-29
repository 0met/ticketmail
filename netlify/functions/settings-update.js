const { saveUserSettings } = require('./lib/database');

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
        if (!settings.gmailAddress || !settings.appPassword) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Gmail address and app password are required'
                })
            };
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

        // Validate refresh interval
        const refreshInterval = parseInt(settings.refreshInterval);
        if (isNaN(refreshInterval) || refreshInterval < 1 || refreshInterval > 60) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Refresh interval must be between 1 and 60 minutes'
                })
            };
        }

        // Validate status
        const validStatuses = ['new', 'open', 'pending', 'closed'];
        if (!validStatuses.includes(settings.defaultStatus)) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid default status. Must be one of: ' + validStatuses.join(', ')
                })
            };
        }

        // Save settings to database
        try {
            await saveUserSettings({
                gmailAddress: settings.gmailAddress,
                appPassword: settings.appPassword,
                refreshInterval: refreshInterval,
                defaultStatus: settings.defaultStatus
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