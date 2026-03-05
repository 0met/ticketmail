const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    return createClient(supabaseUrl, supabaseKey);
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

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: false, error: 'Method not allowed. Use GET.' })
        };
    }

    try {
        const supabase = getSupabase();

        // Preferred: use user_settings.updated_at (we touch this on every sync run)
        let settingsRow = null;
        try {
            const { data, error } = await supabase
                .from('user_settings')
                .select('updated_at, created_at, gmail_address, last_sync_at, last_sync_status, last_sync_message, last_sync_processed, last_sync_created, last_sync_duplicates')
                .order('created_at', { ascending: false })
                .limit(1);

            if (!error && data && data.length > 0) {
                settingsRow = data[0];
            }
            if (error) {
                // Older installs may not have last_sync_* columns yet; retry minimal select.
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from('user_settings')
                    .select('updated_at, created_at, gmail_address')
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (!fallbackError && fallbackData && fallbackData.length > 0) {
                    settingsRow = fallbackData[0];
                }
            }
        } catch (_) {
            // ignore
        }

        let lastSyncAt = settingsRow && settingsRow.updated_at ? settingsRow.updated_at : null;
        let source = lastSyncAt ? 'user_settings.updated_at' : null;

        // Fallback: last ticket creation time (represents last successful ingestion)
        let lastTicketAt = null;
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select('created_at, date_received')
                .order('created_at', { ascending: false })
                .limit(1);

            if (!error && data && data.length > 0) {
                lastTicketAt = data[0].created_at || data[0].date_received || null;
            }
        } catch (_) {
            // ignore
        }

        if (!lastSyncAt && lastTicketAt) {
            lastSyncAt = lastTicketAt;
            source = 'tickets.created_at';
        }

        const lastSyncResult = settingsRow && (
            settingsRow.last_sync_at ||
            settingsRow.last_sync_status ||
            settingsRow.last_sync_message ||
            settingsRow.last_sync_processed !== undefined ||
            settingsRow.last_sync_created !== undefined ||
            settingsRow.last_sync_duplicates !== undefined
        )
            ? {
                at: settingsRow.last_sync_at || null,
                status: settingsRow.last_sync_status || null,
                message: settingsRow.last_sync_message || null,
                processed: settingsRow.last_sync_processed ?? null,
                created: settingsRow.last_sync_created ?? null,
                duplicates: settingsRow.last_sync_duplicates ?? null
            }
            : null;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                now: new Date().toISOString(),
                lastSyncAt,
                source,
                lastSyncResult
            })
        };
    } catch (error) {
        const message = (error && error.message) ? error.message : String(error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: message
            })
        };
    }
};
