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

        // Normalize inputs
        settings.gmailAddress = String(settings.gmailAddress || '').trim().toLowerCase();
        if (settings.appPassword !== undefined && settings.appPassword !== null) {
            // Gmail app passwords may be pasted with spaces; strip all whitespace.
            settings.appPassword = String(settings.appPassword).replace(/\s+/g, '');
            if (!settings.appPassword) {
                delete settings.appPassword;
            }
        }

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

            const msg = String(dbError && dbError.message ? dbError.message : dbError);
            const lower = msg.toLowerCase();

            const isMissingTable =
                lower.includes("could not find the table 'public.user_settings'") ||
                (lower.includes('user_settings') && lower.includes('schema cache')) ||
                lower.includes('relation "user_settings" does not exist');
            
            // Check if it's a table not found error
            if (isMissingTable) {
                return {
                    statusCode: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: false,
                        error: 'User settings table does not exist in Supabase yet. Initialize the table first, then retry saving settings.',
                        hint: 'Visit /.netlify/functions/init-settings-table (requires DATABASE_URL configured) OR create the table in Supabase SQL editor.'
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