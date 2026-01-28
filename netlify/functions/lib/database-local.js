const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure database file exists
const dbPath = path.resolve(__dirname, '../../../local-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('📂 Using Local SQLite Database:', dbPath);

// Promisify SQLite methods
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// The Mock SQL Tag Function
async function sql(strings, ...values) {
    let query = strings[0];

    // Pre-process values for SQLite compatibility
    const processedValues = values.map(v => {
        if (v instanceof Date) {
            return v.toISOString();
        }
        if (typeof v === 'object' && v !== null) {
            return JSON.stringify(v);
        }
        return v;
    });

    for (let i = 0; i < values.length; i++) {
        query += '?' + strings[i + 1];
    }

    // --- SQL Dialect Translation (Postgres -> SQLite) ---

    // 1. Data Types & DDL
    if (query.toUpperCase().includes('CREATE TABLE')) {
        query = query.replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
        query = query.replace(/TIMESTAMP/gi, 'TEXT');
        query = query.replace(/JSONB/gi, 'TEXT');
        query = query.replace(/INET/gi, 'TEXT');
        query = query.replace(/BOOLEAN/gi, 'INTEGER'); // SQLite uses 0/1
    }

    // 2. Operators
    query = query.replace(/ILIKE/gi, 'LIKE'); // SQLite LIKE is case-insensitive

    // 3. Date Functions
    // Postgres: CURRENT_TIMESTAMP -> SQLite: CURRENT_TIMESTAMP (Works)
    // Postgres: NOW() -> SQLite: datetime('now')
    query = query.replace(/NOW\(\)/gi, "datetime('now')");

    // 4. Boolean Literals
    // SQLite doesn't have true/false literals in all contexts, usually 1/0
    // But let's try to handle it in params if possible.
    // For raw SQL strings:
    query = query.replace(/DEFAULT true/gi, "DEFAULT 1");
    query = query.replace(/DEFAULT false/gi, "DEFAULT 0");

    // --- Execution ---

    const isSelect = query.trim().toUpperCase().startsWith('SELECT');
    const hasReturning = query.toUpperCase().includes('RETURNING');

    try {
        if (isSelect || hasReturning) {
            const rows = await all(query, processedValues);
            // Add a mock 'count' property if needed, though usually not used for SELECT
            return rows;
        } else {
            const result = await run(query, processedValues);
            // Mimic Postgres result
            return {
                count: result.changes,
                ...result
            };
        }
    } catch (e) {
        console.error("❌ SQL Error:", e.message);
        console.error("   Query:", query);
        throw e;
    }
}

// Helper to get the DB instance (mimicking the neon export)
function getDatabase() {
    return sql;
}

// Initialize the database tables
async function initializeLocalDatabase() {
    console.log('🏗️ Initializing Local Database Tables...');

    try {
        // Users
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT,
                role TEXT DEFAULT 'customer',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_login TEXT,
                profile_data TEXT
            )
        `;

        // Sessions
        await sql`
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                session_token TEXT UNIQUE NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                ip_address TEXT,
                user_agent TEXT
            )
        `;

        // Permissions
        await sql`
            CREATE TABLE IF NOT EXISTS permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                permission_type TEXT NOT NULL,
                resource_id TEXT,
                granted_at TEXT DEFAULT CURRENT_TIMESTAMP,
                granted_by INTEGER REFERENCES users(id)
            )
        `;

        // Tickets
        await sql`
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_number TEXT,
                subject TEXT NOT NULL,
                from_email TEXT NOT NULL,
                to_email TEXT,
                body TEXT,
                status TEXT DEFAULT 'new',
                message_id TEXT UNIQUE,
                date_received TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                closed_at TEXT,
                resolution_time INTEGER,
                priority TEXT DEFAULT 'medium',
                category TEXT DEFAULT 'general',
                is_manual INTEGER DEFAULT 0,
                source TEXT DEFAULT 'email',
                customer_name TEXT,
                customer_id TEXT,
                customer_phone TEXT,
                customer_email TEXT,
                email_id TEXT UNIQUE -- Legacy support
            )
        `;

        // User Settings
        await sql`
            CREATE TABLE IF NOT EXISTS user_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gmail_address TEXT NOT NULL,
                app_password TEXT NOT NULL,
                refresh_interval INTEGER DEFAULT 5,
                default_status TEXT DEFAULT 'new',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // Activity Log
        await sql`
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                resource_type TEXT,
                resource_id TEXT,
                details TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        console.log('✅ Local Database Initialized');
        return true;
    } catch (error) {
        console.error('❌ Error initializing local database:', error);
        return false;
    }
}

// Run initialization on load
initializeLocalDatabase();

module.exports = {
    getDatabase,
    sql // Export raw sql tag too
};
