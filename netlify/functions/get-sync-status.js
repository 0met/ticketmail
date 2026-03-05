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
                .select('updated_at, created_at, gmail_address')
                .order('created_at', { ascending: false })
                .limit(1);

            if (!error && data && data.length > 0) {
                settingsRow = data[0];
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
                source
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
