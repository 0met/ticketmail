const { neon } = require('@neondatabase/serverless');

function getDatabase() {
    const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('SUPABASE_DB_URL (or DATABASE_URL) environment variable is not set');
    }
    return neon(dbUrl);
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

        // Ensure timestamp columns exist for last-sync tracking
        // (Older installs may be missing these columns.)
        const columns = await sql`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'user_settings'
              AND column_name IN ('created_at', 'updated_at');
        `;

        const columnSet = new Set(columns.map(c => c.column_name));
        if (!columnSet.has('created_at')) {
            await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`;
            actions.push('Added created_at column');
        }
        if (!columnSet.has('updated_at')) {
            await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`;
            actions.push('Added updated_at column');
        }

        // Backfill any null timestamps
        await sql`
            UPDATE user_settings
            SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
                updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
            WHERE created_at IS NULL OR updated_at IS NULL;
        `;

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

        const msg = String(error && error.message ? error.message : error);
        const lower = msg.toLowerCase();
        const isMissingDbUrl = (lower.includes('supabase_db_url') || lower.includes('database_url')) && lower.includes('not set');

        if (isMissingDbUrl) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Cannot initialize tables because SUPABASE_DB_URL (or DATABASE_URL) is not configured in Netlify environment variables.',
                    hint: 'Set SUPABASE_DB_URL to your Supabase Postgres connection string (Settings → Database → Connection string), or run the CREATE TABLE statement in Supabase SQL editor.'
                })
            };
        }
        
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