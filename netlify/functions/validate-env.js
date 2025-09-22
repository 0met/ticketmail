const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto-js');

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

    const results = {
        timestamp: new Date().toISOString(),
        environment: {},
        database: {},
        encryption: {},
        overall: 'unknown'
    };

    try {
        // 1. Check Environment Variables
        results.environment = {
            hasDatabase: !!process.env.DATABASE_URL,
            hasEncryption: !!process.env.ENCRYPTION_KEY,
            nodeEnv: process.env.NODE_ENV || 'development',
            databaseUrlFormat: process.env.DATABASE_URL ? 
                (process.env.DATABASE_URL.startsWith('postgresql://') ? 'valid' : 'invalid') : 
                'missing'
        };

        // 2. Test Database Connection
        if (process.env.DATABASE_URL) {
            try {
                const sql = neon(process.env.DATABASE_URL);
                
                // Test basic connection
                const connectionTest = await sql`SELECT NOW() as current_time, version() as postgres_version`;
                results.database.connection = 'success';
                results.database.currentTime = connectionTest[0].current_time;
                results.database.version = connectionTest[0].postgres_version.split(' ')[0] + ' ' + connectionTest[0].postgres_version.split(' ')[1];

                // Test table creation (dry run)
                try {
                    await sql`
                        CREATE TABLE IF NOT EXISTS validation_test (
                            id SERIAL PRIMARY KEY,
                            test_field VARCHAR(100),
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    `;
                    
                    // Insert a test record
                    await sql`
                        INSERT INTO validation_test (test_field) 
                        VALUES ('validation_test_' || extract(epoch from now()))
                    `;
                    
                    // Clean up test table
                    await sql`DROP TABLE IF EXISTS validation_test`;
                    
                    results.database.tableOperations = 'success';
                } catch (tableError) {
                    results.database.tableOperations = 'failed';
                    results.database.tableError = tableError.message;
                }

            } catch (dbError) {
                results.database.connection = 'failed';
                results.database.error = dbError.message;
            }
        } else {
            results.database.connection = 'no_url';
        }

        // 3. Test Encryption
        if (process.env.ENCRYPTION_KEY) {
            try {
                const testData = 'test_password_123';
                const encrypted = crypto.AES.encrypt(testData, process.env.ENCRYPTION_KEY).toString();
                const decrypted = crypto.AES.decrypt(encrypted, process.env.ENCRYPTION_KEY).toString(crypto.enc.Utf8);
                
                results.encryption.test = decrypted === testData ? 'success' : 'failed';
                results.encryption.keyLength = process.env.ENCRYPTION_KEY.length;
            } catch (encError) {
                results.encryption.test = 'failed';
                results.encryption.error = encError.message;
            }
        } else {
            results.encryption.test = 'no_key';
        }

        // 4. Overall Status
        const dbOk = results.database.connection === 'success' && results.database.tableOperations === 'success';
        const encOk = results.encryption.test === 'success';
        const envOk = results.environment.hasDatabase && results.environment.hasEncryption;

        if (dbOk && encOk && envOk) {
            results.overall = 'all_systems_go';
        } else if (envOk && results.database.connection === 'success') {
            results.overall = 'mostly_working';
        } else if (envOk) {
            results.overall = 'config_ok_db_issues';
        } else {
            results.overall = 'needs_configuration';
        }

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Environment validation complete',
                results: results
            })
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Validation failed: ' + error.message,
                results: results
            })
        };
    }
};