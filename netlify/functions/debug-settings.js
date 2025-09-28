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
        const sql = getDatabase();
        
        // Check if user_settings table exists and has data
        const settingsExists = await sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'user_settings'
            );
        `;

        const settingsCount = await sql`
            SELECT COUNT(*) as count FROM user_settings
        `;

        const settingsData = await sql`
            SELECT gmail_address, refresh_interval, default_status, created_at 
            FROM user_settings 
            ORDER BY created_at DESC 
            LIMIT 5
        `;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                tableExists: settingsExists[0].exists,
                settingsCount: parseInt(settingsCount[0].count),
                recentSettings: settingsData.map(setting => ({
                    gmail_address: setting.gmail_address,
                    refresh_interval: setting.refresh_interval,
                    default_status: setting.default_status,
                    created_at: setting.created_at
                }))
            })
        };

    } catch (error) {
        console.error('Database check error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                success: false, 
                error: error.message,
                stack: error.stack
            })
        };
    }
};