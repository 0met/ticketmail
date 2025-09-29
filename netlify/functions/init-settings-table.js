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
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    try {
        const sql = getDatabase();
        console.log('Checking and initializing user_settings table...');

        // Check if user_settings table exists
        const tableExists = await sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'user_settings'
            );
        `;

        let actions = [];

        if (!tableExists[0].exists) {
            console.log('Creating user_settings table...');
            
            await sql`
                CREATE TABLE user_settings (
                    id SERIAL PRIMARY KEY,
                    gmail_address VARCHAR(255) NOT NULL,
                    app_password TEXT NOT NULL,
                    refresh_interval INTEGER DEFAULT 5,
                    default_status VARCHAR(50) DEFAULT 'new',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;
            
            actions.push('Created user_settings table');
        } else {
            actions.push('user_settings table already exists');
        }

        // Check current settings count
        const settingsCount = await sql`
            SELECT COUNT(*) as count FROM user_settings
        `;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                tableExists: true,
                settingsCount: parseInt(settingsCount[0].count),
                actions: actions,
                message: actions.join('. ') + `. Current settings count: ${settingsCount[0].count}`
            })
        };

    } catch (error) {
        console.error('Table initialization error:', error);
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
                stack: error.stack
            })
        };
    }
};