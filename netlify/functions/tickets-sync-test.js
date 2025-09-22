const { getUserSettings, saveTicket } = require('./lib/database');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Helper function to connect to IMAP with timeout
function connectToImap(settings, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('IMAP connection timeout'));
        }, timeoutMs);

        const imap = new Imap({
            user: settings.gmailAddress,
            password: settings.appPassword,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false
            },
            connTimeout: 10000, // 10 second connection timeout
            authTimeout: 5000   // 5 second auth timeout
        });

        imap.once('ready', () => {
            clearTimeout(timeout);
            resolve(imap);
        });

        imap.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        try {
            imap.connect();
        } catch (error) {
            clearTimeout(timeout);
            reject(error);
        }
    });
}

exports.handler = async (event, context) => {
    // Set function timeout
    context.callbackWaitsForEmptyEventLoop = false;

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

    let imap = null;

    try {
        console.log('Starting email sync process...');
        
        // Get user settings
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
                    error: 'No Gmail settings found. Please configure your settings first.'
                })
            };
        }

        // Validate settings
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
                    error: 'Invalid Gmail settings. Missing email or app password.'
                })
            };
        }

        console.log('Connecting to Gmail IMAP...');
        
        // Try to connect with timeout
        try {
            imap = await connectToImap(settings, 15000); // 15 second timeout
            console.log('IMAP connection successful');
        } catch (imapError) {
            console.error('IMAP connection failed:', imapError.message);
            
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Failed to connect to Gmail: ' + imapError.message,
                    hint: 'Please verify your Gmail address and app password are correct.'
                })
            };
        }

        // For now, just return success after connection test
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Gmail connection test successful',
                debug: {
                    connectedTo: settings.gmailAddress.substring(0, 5) + '***',
                    status: 'connected'
                }
            })
        };

    } catch (error) {
        console.error('Error in email sync:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Email sync failed: ' + error.message,
                debug: 'sync_exception'
            })
        };
    } finally {
        // Always clean up IMAP connection
        if (imap) {
            try {
                imap.end();
                console.log('IMAP connection closed');
            } catch (cleanupError) {
                console.log('Error closing IMAP connection:', cleanupError.message);
            }
        }
    }
};