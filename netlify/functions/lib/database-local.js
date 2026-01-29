const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

// Database file path
const dbPath = path.resolve(__dirname, '../../../local-database.sqlite');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

async function getDatabaseConnection() {
    if (db) {
        return db;
    }

    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    console.log('🔌 Connected to SQLite database:', dbPath);
    return db;
}

async function sql(strings, ...values) {
    const connection = await getDatabaseConnection();
    
    // Build the query
    let query = strings[0];
    const params = [];
    
    for (let i = 0; i < values.length; i++) {
        query += `?${strings[i + 1]}`;
        params.push(values[i]);
    }
    
    const isSelect = /^\s*(SELECT|PRAGMA|WITH)/i.test(query);
    
    if (isSelect) {
        return await connection.all(query, params);
    } else {
        const result = await connection.run(query, params);
        return {
            count: result.changes,
            rows: []
        };
    }
}

function getDatabase() {
    return sql;
}

async function closeDatabase() {
    if (db) {
        await db.close();
        db = null;
    }
}

module.exports = {
    getDatabase,
    sql,
    closeDatabase
};
