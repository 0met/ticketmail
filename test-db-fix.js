const { getDatabase } = require('./netlify/functions/lib/database-local');

async function testFix() {
    console.log('🧪 Testing Database Adapter Fix...');
    const sql = getDatabase();

    try {
        // Test 1: Simple Select
        console.log('1️⃣ Testing SELECT...');
        const users = await sql`SELECT * FROM users LIMIT 1`;
        console.log('   ✅ Select worked. Result:', users);

        // Test 2: Date Object Handling
        console.log('2️⃣ Testing Date Object Parameter...');
        const now = new Date();

        let userId = 1;
        if (users.length > 0) {
            userId = users[0].id;
        }

        console.log('   Inserting session with Date object...');
        // Correct tagged template syntax
        const token = 'test-token-' + Date.now();
        await sql`
            INSERT INTO sessions (user_id, session_token, expires_at)
            VALUES (${userId}, ${token}, ${now})
        `;
        console.log('   ✅ Insert with Date object succeeded!');

        // Test 3: Object Handling
        console.log('3️⃣ Testing Object Parameter...');
        const details = { test: "data", active: true };
        // We'll insert into activity_log
        await sql`
            INSERT INTO activity_log (user_id, action, resource_type, details)
            VALUES (${userId}, 'test_action', 'test', ${details})
        `;
        console.log('   ✅ Insert with Object succeeded!');

        console.log('\n🎉 ALL TESTS PASSED. The adapter is fixed.');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
    }
}

testFix();
