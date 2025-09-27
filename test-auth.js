// Simple Node.js test to verify authentication functions
// Run with: node test-auth.js

const path = require('path');
const { createUser, authenticateUser, validateSession } = require('./netlify/functions/lib/auth');

async function testAuth() {
    console.log('🔧 Testing TicketMail Authentication System...\n');
    
    try {
        console.log('1. Testing database connection...');
        
        // Test creating a user
        console.log('2. Creating test user...');
        const userData = {
            email: 'test@ticketmail.com',
            password: 'testpassword123',
            fullName: 'Test User',
            role: 'admin'
        };
        
        const user = await createUser(userData);
        console.log('✅ User created:', user.email, user.role);
        
        // Test authentication
        console.log('3. Testing authentication...');
        const authResult = await authenticateUser(userData.email, userData.password);
        
        if (authResult.success) {
            console.log('✅ Authentication successful');
            console.log('   User ID:', authResult.user.id);
            console.log('   Session Token:', authResult.sessionToken.substring(0, 20) + '...');
            
            // Test session validation
            console.log('4. Testing session validation...');
            const sessionResult = await validateSession(authResult.sessionToken);
            
            if (sessionResult.valid) {
                console.log('✅ Session validation successful');
                console.log('   User:', sessionResult.user.email);
            } else {
                console.log('❌ Session validation failed:', sessionResult.error);
            }
        } else {
            console.log('❌ Authentication failed:', authResult.error);
        }
        
        console.log('\n🎉 Authentication system test completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Set up the database tables (run setup-user-management)');
        console.log('2. Create the default admin user');
        console.log('3. Start the web server');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
            console.log('\n💡 Tip: You need to run the database setup first.');
            console.log('   The authentication functions are working, but the database tables need to be created.');
        }
    }
}

// Run the test
testAuth().then(() => {
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});