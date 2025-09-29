const { neon } = require('@neondatabase/serverless');

function getDatabase() {
    return neon(process.env.DATABASE_URL);
}

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
        console.log('Testing basic database connection...');
        const sql = getDatabase();
        
        console.log('Checking if user_settings table exists...');
        const tableCheck = await sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'user_settings'
            );
        `;
        console.log('Table exists:', tableCheck[0].exists);

        console.log('Checking user_settings data...');
        const settingsData = await sql`
            SELECT id, gmail_address, refresh_interval, default_status, created_at, 
                   LENGTH(app_password) as password_length
            FROM user_settings 
            ORDER BY created_at DESC 
            LIMIT 3
        `;
        console.log('Settings found:', settingsData.length);

        // Try to test the crypto functionality separately
        let cryptoTest = 'Crypto test failed';
        try {
            const crypto = require('crypto-js');
            const testText = 'test-encryption';
            const secretKey = process.env.ENCRYPTION_KEY || 'default-secret-key';
            const encrypted = crypto.AES.encrypt(testText, secretKey).toString();
            const decrypted = crypto.AES.decrypt(encrypted, secretKey).toString(crypto.enc.Utf8);
            cryptoTest = decrypted === testText ? 'Crypto test passed' : 'Crypto test failed - decrypt mismatch';
        } catch (cryptoError) {
            cryptoTest = 'Crypto test failed: ' + cryptoError.message;
        }

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                database: {
                    connected: true,
                    userSettingsTableExists: tableCheck[0].exists,
                    settingsCount: settingsData.length,
                    settings: settingsData.map(s => ({
                        id: s.id,
                        gmail_address: s.gmail_address,
                        refresh_interval: s.refresh_interval,
                        default_status: s.default_status,
                        created_at: s.created_at,
                        password_length: s.password_length
                    }))
                },
                crypto: {
                    testResult: cryptoTest,
                    hasEncryptionKey: !!process.env.ENCRYPTION_KEY
                }
            })
        };

    } catch (error) {
        console.error('Simple database test error:', error);
        console.error('Error stack:', error.stack);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                success: false, 
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            })
        };
    }
};