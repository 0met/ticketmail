const { neon } = require('@neondatabase/serverless');

async function testLogin() {
  try {
    console.log('🧪 Testing Login System...');
    console.log('========================');
    
    const sql = neon(process.env.DATABASE_URL);
    
    // 1. Test database connection
    console.log('1️⃣ Testing database connection...');
    await sql`SELECT 1 as test`;
    console.log('✅ Database connection OK');
    
    // 2. Check if admin user exists
    console.log('');
    console.log('2️⃣ Checking admin user...');
    const adminUser = await sql`
      SELECT id, email, password_hash, role, is_active 
      FROM users 
      WHERE email = 'admin@ticketmail.com'
    `;
    
    if (adminUser.length === 0) {
      console.log('❌ No admin user found!');
      return;
    }
    
    console.log('✅ Admin user found:');
    console.log(`   Email: ${adminUser[0].email}`);
    console.log(`   Role: ${adminUser[0].role}`);
    console.log(`   Active: ${adminUser[0].is_active}`);
    console.log(`   Password hash starts with: ${adminUser[0].password_hash.substring(0, 20)}...`);
    
    // 3. Test password verification
    console.log('');
    console.log('3️⃣ Testing password verification...');
    const bcrypt = require('bcryptjs');
    const testPassword = 'admin123456';
    const isPasswordValid = await bcrypt.compare(testPassword, adminUser[0].password_hash);
    
    console.log(`Password "${testPassword}" is: ${isPasswordValid ? '✅ VALID' : '❌ INVALID'}`);
    
    // 4. Test auth function directly
    console.log('');
    console.log('4️⃣ Testing auth function directly...');
    
    // Import our auth module
    const { authenticateUser } = require('./netlify/functions/lib/auth.js');
    
    try {
      const authResult = await authenticateUser('admin@ticketmail.com', 'admin123456');
      console.log('✅ Auth function result:', JSON.stringify(authResult, null, 2));
    } catch (authError) {
      console.log('❌ Auth function failed:', authError.message);
    }
    
    // 5. Test login endpoint simulation
    console.log('');
    console.log('5️⃣ Simulating login endpoint...');
    
    const loginEvent = {
      httpMethod: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@ticketmail.com',
        password: 'admin123456'
      })
    };
    
    const loginContext = {
      callbackWaitsForEmptyEventLoop: false
    };
    
    // Import and test login function
    const loginHandler = require('./netlify/functions/auth-login.js');
    
    try {
      const loginResult = await loginHandler.handler(loginEvent, loginContext);
      console.log('Login endpoint response:');
      console.log('Status:', loginResult.statusCode);
      console.log('Body:', loginResult.body);
      
      if (loginResult.statusCode === 200) {
        const responseData = JSON.parse(loginResult.body);
        console.log('✅ Login successful!');
        console.log('User:', responseData.user);
      }
    } catch (loginError) {
      console.log('❌ Login endpoint failed:', loginError.message);
      console.log('Stack:', loginError.stack);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

if (!process.env.DATABASE_URL) {
  console.log('❌ Please set DATABASE_URL environment variable');
} else {
  testLogin();
}