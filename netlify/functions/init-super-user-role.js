const { getSqlDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // CORS
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

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: 'Method not allowed. Use GET.' })
        };
    }

    try {
        const sql = getSqlDatabase();

        // Normalize roles in-place
        await sql`UPDATE public.users SET role = lower(role) WHERE role IS NOT NULL`;
        await sql`UPDATE public.users SET role = 'super_user' WHERE role IN ('super user', 'super-user', 'superuser')`;
        await sql`UPDATE public.users SET role = 'customer' WHERE role IS NULL OR role NOT IN ('admin', 'super_user', 'agent', 'customer')`;

        // Discover any existing CHECK constraints that mention role and drop them.
        const constraints = await sql`
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'public.users'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%role%'
        `;

        for (const row of constraints || []) {
            const name = row.conname;
            if (!name) continue;
            // Neon serverless client doesn't support identifier placeholders; build safely-quoted SQL.
            const escaped = String(name).replace(/"/g, '""');
            await sql(`ALTER TABLE public.users DROP CONSTRAINT IF EXISTS "${escaped}"`);
        }

        // Add the new constraint (idempotent-ish: if it already exists, this will error)
        // Use a stable name so future migrations can address it.
        await sql`ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'super_user', 'agent', 'customer'))`;

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                message: 'Super User role enabled. Roles normalized and users_role_check constraint applied.'
            })
        };
    } catch (error) {
        const msg = String(error && error.message ? error.message : error);
        const lower = msg.toLowerCase();
        const missingDbUrl = (lower.includes('supabase_db_url') || lower.includes('database_url')) && lower.includes('not set');
        const constraintAlready = lower.includes('already exists') && lower.includes('users_role_check');

        if (missingDbUrl) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: false,
                    error: 'Cannot migrate because SUPABASE_DB_URL (or DATABASE_URL) is not configured in Netlify environment variables.',
                    hint: 'Set SUPABASE_DB_URL to your Supabase Postgres connection string (Settings → Database → Connection string), then re-run this endpoint.'
                })
            };
        }

        if (constraintAlready) {
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    message: 'users_role_check already exists. Roles were normalized.'
                })
            };
        }

        console.error('init-super-user-role error:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: 'Migration failed: ' + msg })
        };
    }
};
