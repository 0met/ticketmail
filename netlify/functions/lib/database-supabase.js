const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getSupabaseClient() {
    if (supabase) return supabase;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        const missing = [!supabaseUrl ? 'SUPABASE_URL' : null, !supabaseServiceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null]
            .filter(Boolean)
            .join(', ');
        const error = new Error(`Missing required environment variable(s): ${missing}`);
        error.code = 'MISSING_SUPABASE_ENV';
        throw error;
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    return supabase;
}

// Template literal function for Supabase (simplified for basic queries)
function sql(strings, ...values) {
    // This is a basic implementation - for production, you might want to use proper SQL execution
    // For now, we'll return a promise that executes the query
    return {
        async then(callback) {
            try {
                // For SELECT queries
                if (strings[0].trim().toUpperCase().startsWith('SELECT')) {
                    const query = strings[0];
                    if (query.includes('FROM users WHERE email =')) {
                        const email = values[0];
                        const { data, error } = await supabase
                            .from('users')
                            .select('*')
                            .eq('email', email)
                            .single();

                        if (error && error.code !== 'PGRST116') {
                            throw error;
                        }

                        return callback(data ? [data] : []);
                    }
                }

                // For INSERT queries
                if (strings[0].trim().toUpperCase().startsWith('INSERT INTO users')) {
                    const userData = {
                        email: values[0],
                        password_hash: values[1],
                        full_name: values[2] || null,
                        role: values[3] || 'customer',
                        company_id: values[4] || null,
                        department: values[5] || null,
                        job_title: values[6] || null,
                        phone: values[7] || null
                    };

                    const { data, error } = await supabase
                        .from('users')
                        .insert(userData)
                        .select()
                        .single();

                    if (error) {
                        throw error;
                    }

                    return callback([data]);
                }

                // For other queries, we'll need to implement them case by case
                console.log('Unhandled SQL query:', strings, values);
                return callback([]);

            } catch (err) {
                console.error('Supabase query error:', err);
                throw err;
            }
        }
    };
}

// For direct table operations
async function getDatabase() {
    return {
        // Users table operations
        async getUserByEmail(email) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('email', email)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
                throw error;
            }

            return data;
        },

        async getUserById(id) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', id)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data;
        },

        async createUser(userData) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('users')
                .insert(userData)
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data;
        },

        async updateUser(id, updates) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('users')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data;
        },

        // Sessions table operations
        async createSession(sessionData) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('sessions')
                .insert(sessionData)
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data;
        },

        async getSessionByToken(token) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('sessions')
                .select('*, users(*)')
                .eq('session_token', token)
                .gt('expires_at', new Date().toISOString())
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data;
        },

        async deleteSession(token) {
            const supabase = getSupabaseClient();
            const { error } = await supabase
                .from('sessions')
                .delete()
                .eq('session_token', token);

            if (error) {
                throw error;
            }
        },

        // Activity log operations
        async logActivity(activityData) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('activity_log')
                .insert(activityData)
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data;
        }
    };
}

module.exports = { getDatabase, sql };