const { getUserSettings } = require('./lib/database');

exports.handler = async (event, context) => {
    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    try {
        console.log('Testing settings retrieval...');

        // Get user settings (database initialization is handled internally)
        const settings = await getUserSettings();
        console.log('Settings retrieved:', settings);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Settings test complete',
                hasSettings: !!settings,
                settingsData: settings ? {
                    hasGmailAddress: !!settings.gmailAddress,
                    hasAppPassword: !!settings.appPassword,
                    gmailAddress: settings.gmailAddress ? settings.gmailAddress.substring(0, 5) + '***' : 'none',
                    refreshInterval: settings.refreshInterval,
                    defaultStatus: settings.defaultStatus
                } : null
            })
        };

    } catch (error) {
        console.error('Error in settings test:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Settings test failed: ' + error.message
            })
        };
    }
};