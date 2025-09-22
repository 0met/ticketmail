const { getUserSettings } = require('./lib/database');

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
        console.log('Starting debug sync process...');
        
        // Test 1: Get user settings
        console.log('Fetching user settings...');
        const settings = await getUserSettings();
        console.log('Settings retrieved:', settings ? 'Found' : 'Not found');
        
        if (!settings) {
            console.log('No settings found, returning error');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'No Gmail settings found. Please configure your settings first.',
                    debug: 'settings_not_found'
                })
            };
        }

        // Test 2: Validate settings
        if (!settings.gmailAddress || !settings.appPassword) {
            console.log('Invalid settings - missing email or password');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid Gmail settings. Missing email or app password.',
                    debug: 'invalid_settings',
                    hasEmail: !!settings.gmailAddress,
                    hasPassword: !!settings.appPassword
                })
            };
        }

        // Test 3: Return success with settings info (no IMAP connection yet)
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Debug test successful - settings validated',
                debug: {
                    hasSettings: true,
                    emailPrefix: settings.gmailAddress.substring(0, 5) + '***',
                    hasPassword: !!settings.appPassword,
                    refreshInterval: settings.refreshInterval
                }
            })
        };

    } catch (error) {
        console.error('Error in debug sync:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Debug sync failed: ' + error.message,
                debug: 'exception_caught'
            })
        };
    }
};