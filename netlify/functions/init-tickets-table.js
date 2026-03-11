const { neon } = require('@neondatabase/serverless');

function getDatabase() {
    const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('SUPABASE_DB_URL (or DATABASE_URL) environment variable is not set');
    }
    return neon(dbUrl);
}

function normalizeBool(value) {
    return value === true || value === 'true' || value === '1' || value === 1;
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

    // Allow GET so it can be visited in the browser easily, but keep POST for parity.
    if (!['GET', 'POST'].includes(event.httpMethod)) {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed. Use GET or POST.'
            })
        };
    }

    try {
        const sql = getDatabase();
        const query = event.queryStringParameters || {};
        const includeOptionalColumns = normalizeBool(query.includeOptionalColumns);

        console.log('Checking and initializing tickets table...');

        const tableExists = await sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = 'tickets'
            );
        `;

        const actions = [];

        if (!tableExists[0].exists) {
            console.log('Creating tickets table...');

            await sql`
                CREATE TABLE tickets (
                    id BIGSERIAL PRIMARY KEY,
                    ticket_number VARCHAR(32) UNIQUE,
                    subject TEXT NOT NULL,
                    from_email TEXT NOT NULL,
                    to_email TEXT,
                    body TEXT,
                    status VARCHAR(50) DEFAULT 'new',
                    priority VARCHAR(20) DEFAULT 'medium',
                    category VARCHAR(100) DEFAULT 'general',
                    message_id TEXT UNIQUE NOT NULL,
                    email_id TEXT UNIQUE,
                    date_received TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    received_at TIMESTAMPTZ,
                    is_manual BOOLEAN DEFAULT FALSE,
                    source VARCHAR(50) DEFAULT 'email',
                    customer_name TEXT,
                    customer_id TEXT,
                    customer_phone TEXT,
                    customer_email TEXT,
                    company_id TEXT,
                    resolution_time INTEGER,
                    closed_at TIMESTAMPTZ,
                    first_response_due_at TIMESTAMPTZ,
                    resolution_due_at TIMESTAMPTZ,
                    created_by TEXT,
                    assigned_to TEXT,
                    customer_company TEXT,
                    body_text TEXT,
                    body_html TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            `;

            actions.push('Created tickets table');

            await sql`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_tickets_date_received ON tickets(date_received);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_tickets_message_id ON tickets(message_id);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON tickets(ticket_number);`;

            actions.push('Created tickets indexes');
        } else {
            actions.push('tickets table already exists');
        }

        // Ensure required columns exist for current code paths.
        // This makes the function safe to run on older installs.
        let requiredAdded = 0;
        const addRequired = async (sqlCall) => {
            try {
                await sqlCall;
                requiredAdded += 1;
            } catch {
                // Ignore - column may already exist or table is in a different shape.
            }
        };

        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_number VARCHAR(32) UNIQUE;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS subject TEXT;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS from_email TEXT;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS to_email TEXT;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS body TEXT;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'new';`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'general';`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS message_id TEXT;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS email_id TEXT;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS date_received TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'email';`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_name TEXT;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_id TEXT;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_phone TEXT;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_email TEXT;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS company_id TEXT;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_response_due_at TIMESTAMPTZ;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_due_at TIMESTAMPTZ;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;`);
        await addRequired(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;`);

        if (requiredAdded > 0) {
            actions.push(`Ensured required columns (${requiredAdded} statements executed)`);
        }

        if (includeOptionalColumns) {
            let optionalAdded = 0;
            const addOptional = async (sqlCall) => {
                try {
                    await sqlCall;
                    optionalAdded += 1;
                } catch {
                    // ignore
                }
            };

            await addOptional(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_time INTEGER;`);
            await addOptional(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;`);
            await addOptional(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS created_by TEXT;`);
            await addOptional(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_to TEXT;`);
            await addOptional(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_company TEXT;`);
            await addOptional(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS body_text TEXT;`);
            await addOptional(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS body_html TEXT;`);

            if (optionalAdded > 0) {
                actions.push(`Ensured optional columns (${optionalAdded} statements executed)`);
            }
        }

        // Enforce uniqueness on message_id when possible.
        // If duplicates already exist, this will fail; in that case we leave it to the app-level duplicate check.
        try {
            await sql`ALTER TABLE tickets ALTER COLUMN message_id SET NOT NULL;`;
        } catch (err) {
            actions.push(`Could not set message_id NOT NULL: ${err.message}`);
        }

        try {
            await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_message_id_unique ON tickets(message_id);`;
        } catch (err) {
            actions.push(`Could not create unique index on message_id: ${err.message}`);
        }

        // Backfill timestamps if they are missing.
        try {
            await sql`
                UPDATE tickets
                SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
                    updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
                WHERE created_at IS NULL OR updated_at IS NULL;
            `;
        } catch (err) {
            actions.push(`Could not backfill timestamps: ${err.message}`);
        }

        const ticketCount = await sql`SELECT COUNT(*)::int as count FROM tickets;`;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                tableExists: true,
                ticketCount: ticketCount[0]?.count ?? 0,
                actions,
                message: actions.join('. ') + `. Current tickets count: ${ticketCount[0]?.count ?? 0}`,
                note: includeOptionalColumns
                    ? 'Optional columns included'
                    : 'Optional columns not included (add ?includeOptionalColumns=true to include)'
            })
        };
    } catch (error) {
        console.error('Tickets table initialization error:', error);
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
