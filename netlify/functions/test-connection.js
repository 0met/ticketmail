const { getUserSettings } = require('./lib/database');
const Imap = require('imap');

function connectToImap({ gmailAddress, appPassword }, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('IMAP connection timeout'));
        }, timeoutMs);

        const imap = new Imap({
            user: gmailAddress,
            password: appPassword,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false
            },
            connTimeout: 10000,
            authTimeout: 5000
        });

        const cleanUp = (err, readyImap) => {
            clearTimeout(timeout);
            if (err) {
                reject(err);
                return;
            }
            resolve(readyImap);
        };

        imap.once('ready', () => cleanUp(null, imap));
        imap.once('error', (err) => cleanUp(err));

        try {
            imap.connect();
        } catch (error) {
            cleanUp(error);
        }
    });
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

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

    let parsedBody = {};
    try {
        parsedBody = event.body ? JSON.parse(event.body) : {};
    } catch (err) {
        parsedBody = {};
    }

    let settings = null;
    try {
        settings = await getUserSettings();
    } catch (err) {
        console.error('Failed to load saved settings:', err.message);
    }

    const gmailAddress = (parsedBody.gmailAddress || settings?.gmailAddress || '').trim();
    const appPassword = (parsedBody.appPassword || settings?.appPassword || '').trim();

    if (!gmailAddress || !appPassword) {
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Gmail address and app password are required.'
            })
        };
    }

    let imap = null;
    try {
        imap = await connectToImap({ gmailAddress, appPassword });
        imap.end();

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Connected to Gmail successfully!',
                email: gmailAddress
            })
        };
    } catch (error) {
        console.error('IMAP connection test failed:', error);
        if (imap) {
            try { imap.end(); } catch (err) {
                console.warn('Failed to close IMAP connection:', err.message);
            }
        }

        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: error.message || 'Failed to connect to Gmail.'
            })
        };
    }
};
