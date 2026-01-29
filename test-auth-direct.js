const { authenticateUser } = require('./netlify/functions/lib/auth');

async function testLogin() {
    console.log('Testing login with admin@ticketmail.com and admin123456...');
    const result = await authenticateUser('admin@ticketmail.com', 'admin123456');
    console.log('Login result:', result);
}

testLogin().catch(console.error);