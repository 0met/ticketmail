const { validateSession } = require('./lib/auth');
const { createClient } = require('@supabase/supabase-js');
const { getSqlDatabase } = require('./lib/database');

function getSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        const missing = [!url ? 'SUPABASE_URL' : null, !key ? 'SUPABASE_SERVICE_ROLE_KEY' : null].filter(Boolean);
        const error = new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
        error.code = 'MISSING_SUPABASE_ENV';
        throw error;
    }

    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

async function ensureUserTodosTable() {
    try {
        const sql = getSqlDatabase();

        await sql`CREATE TABLE IF NOT EXISTS user_todos (
            id BIGSERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            is_completed BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMPTZ
        );`;

        await sql`CREATE INDEX IF NOT EXISTS idx_user_todos_user_id ON user_todos(user_id);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_user_todos_user_completed ON user_todos(user_id, is_completed);`;

        try {
            await sql`NOTIFY pgrst, 'reload schema';`;
        } catch (_) {
            // ignore
        }

        return true;
    } catch (error) {
        // Best-effort. If SQL isn't configured, callers may still succeed if the table already exists.
        console.warn('Could not ensure user_todos table:', error && error.message ? error.message : error);
        return false;
    }
}

function getBearerToken(event) {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) return null;
    return authHeader.replace('Bearer ', '').trim();
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    };
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
            },
            body: ''
        };
    }

    try {
        const token = getBearerToken(event);
        if (!token) {
            return json(401, { success: false, error: 'No authorization token provided' });
        }

        const sessionValidation = await validateSession(token);
        if (!sessionValidation.valid) {
            return json(401, { success: false, error: 'Invalid session' });
        }

        const userId = sessionValidation.user && sessionValidation.user.id;
        if (!userId) {
            return json(401, { success: false, error: 'Invalid session user' });
        }

        await ensureUserTodosTable();

        const supabase = getSupabaseClient();

        if (event.httpMethod === 'GET') {
            const { data, error } = await supabase
                .from('user_todos')
                .select('id, text, is_completed, created_at, updated_at, completed_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            return json(200, { success: true, todos: data || [] });
        }

        if (event.httpMethod === 'POST') {
            const payload = event.body ? JSON.parse(event.body) : {};
            const text = (payload.text || '').toString().trim();

            if (!text) {
                return json(400, { success: false, error: 'Todo text is required' });
            }

            if (text.length > 500) {
                return json(400, { success: false, error: 'Todo text is too long' });
            }

            const now = new Date().toISOString();

            const { data, error } = await supabase
                .from('user_todos')
                .insert({
                    user_id: userId,
                    text,
                    is_completed: false,
                    created_at: now,
                    updated_at: now,
                    completed_at: null
                })
                .select('id, text, is_completed, created_at, updated_at, completed_at')
                .single();

            if (error) {
                throw error;
            }

            return json(200, { success: true, todo: data });
        }

        if (event.httpMethod === 'PUT') {
            const payload = event.body ? JSON.parse(event.body) : {};
            const rawId = payload.id;
            const isCompleted = payload.isCompleted;

            if (rawId === null || rawId === undefined) {
                return json(400, { success: false, error: 'Todo id is required' });
            }

            const id = (typeof rawId === 'number') ? rawId : parseInt(String(rawId), 10);
            if (!Number.isFinite(id)) {
                return json(400, { success: false, error: 'Todo id must be a number' });
            }

            if (typeof isCompleted !== 'boolean') {
                return json(400, { success: false, error: 'isCompleted must be boolean' });
            }

            const now = new Date().toISOString();

            const { data, error } = await supabase
                .from('user_todos')
                .update({
                    is_completed: isCompleted,
                    updated_at: now,
                    completed_at: isCompleted ? now : null
                })
                .eq('id', id)
                .eq('user_id', userId)
                .select('id, text, is_completed, created_at, updated_at, completed_at')
                .single();

            if (error) {
                throw error;
            }

            return json(200, { success: true, todo: data });
        }

        return json(405, { success: false, error: 'Method not allowed' });
    } catch (error) {
        console.error('Todos API error:', error);

        if (error && error.code === 'MISSING_SUPABASE_ENV') {
            return json(500, { success: false, error: error.message });
        }

        return json(500, {
            success: false,
            error: error && error.message ? error.message : 'Internal server error'
        });
    }
};
