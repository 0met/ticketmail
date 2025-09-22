const { getUserSettings, saveTicket } = require('./lib/database');
const Imap = require('imap');

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
            connTimeout: 10000,
            authTimeout: 5000
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

// Simple inbox check
function checkInbox(imap) {
    return new Promise((resolve, reject) => {
        imap.openBox('INBOX', true, (err, box) => { // true = read-only mode
            if (err) {
                reject(err);
                return;
            }

            resolve({
                totalMessages: box.messages.total,
                unseenMessages: box.messages.unseen,
                boxName: box.name
            });
        });
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

    let imap = null;

    try {
        console.log('Starting simple inbox check...');
        
        const settings = await getUserSettings();
        
        if (!settings || !settings.gmailAddress || !settings.appPassword) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Gmail settings not configured properly.'
                })
            };
        }

        console.log('Connecting to Gmail...');
        imap = await connectToImap(settings, 15000);
        console.log('Connected successfully');

        console.log('Checking inbox...');
        const inboxInfo = await checkInbox(imap);
        console.log('Inbox checked:', inboxInfo);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Inbox check successful',
                data: {
                    totalMessages: inboxInfo.totalMessages,
                    unseenMessages: inboxInfo.unseenMessages,
                    boxName: inboxInfo.boxName
                }
            })
        };

    } catch (error) {
        console.error('Error in inbox check:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Inbox check failed: ' + error.message
            })
        };
    } finally {
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