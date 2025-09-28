const { getUserSettings } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

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
        console.log('Getting user settings...');
        
        // Try to get settings from database
        const settings = await getUserSettings();
        
        if (settings) {
            console.log('Settings found in database');
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    settings: {
                        gmailAddress: settings.gmailAddress,
                        refreshInterval: settings.refreshInterval,
                        defaultStatus: settings.defaultStatus,
                        hasAppPassword: !!settings.appPassword
                    },
                    source: 'database'
                })
            };
        } else {
            console.log('No settings found in database');
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    settings: null,
                    source: 'none',
                    message: 'No settings found. Please configure Gmail settings.'
                })
            };
        }

    } catch (error) {
        console.error('Error getting settings:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                success: false, 
                error: 'Failed to retrieve settings: ' + error.message,
                stack: error.stack
            })
        };
    }
};