const { validateSession } = require('./lib/auth');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    try {
        // Test basic functionality
        const testResults = {
            timestamp: new Date().toISOString(),
            authModule: null,
            databaseConnection: null,
            environment: {
                hasDatabase: !!process.env.DATABASE_URL,
                nodeEnv: process.env.NODE_ENV
            }
        };

        // Test auth module import
        try {
            const { createUser } = require('./lib/auth');
            testResults.authModule = 'imported successfully';
        } catch (error) {
            testResults.authModule = 'import failed: ' + error.message;
        }

        // Test database connection
        try {
            const { neon } = require('@neondatabase/serverless');
            const sql = neon(process.env.DATABASE_URL);
            
            const result = await sql`SELECT 1 as test`;
            testResults.databaseConnection = result.length > 0 ? 'connected' : 'query failed';
        } catch (error) {
            testResults.databaseConnection = 'failed: ' + error.message;
        }

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Authentication system test complete',
                results: testResults
            })
        };

    } catch (error) {
        console.error('Auth test error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: error.message,
                message: 'Authentication system test failed'
            })
        };
    }
};