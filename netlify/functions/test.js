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

    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            success: true,
            message: 'Netlify Functions are working!',
            timestamp: new Date().toISOString(),
            environment: {
                hasDatabase: !!process.env.DATABASE_URL,
                hasEncryption: !!process.env.ENCRYPTION_KEY,
                nodeEnv: process.env.NODE_ENV || 'development'
            }
        })
    };
};