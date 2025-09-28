// Test live authentication system
async function testLiveAuth() {
    console.log('🌐 Testing Live Authentication System...');
    console.log('======================================');
    
    const baseUrl = 'https://ticketmail.netlify.app/.netlify/functions';
    
    try {
        // Test login
        console.log('1️⃣ Testing live login endpoint...');
        
        const loginResponse = await fetch(`${baseUrl}/auth-login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'admin@ticketmail.com',
                password: 'admin123456'
            })
        });
        
        const loginData = await loginResponse.json();
        
        console.log('Status:', loginResponse.status);
        console.log('Response:', loginData);
        
        if (loginResponse.ok && loginData.success) {
            console.log('✅ Live login successful!');
            console.log('User:', loginData.user);
            console.log('Session token received:', loginData.sessionToken ? 'Yes' : 'No');
            
            // Test session validation
            console.log('');
            console.log('2️⃣ Testing session validation...');
            
            const validateResponse = await fetch(`${baseUrl}/auth-validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionToken: loginData.sessionToken
                })
            });
            
            const validateData = await validateResponse.json();
            console.log('Validation response:', validateData);
            
            if (validateResponse.ok && validateData.success) {
                console.log('✅ Session validation successful!');
                console.log('User from validation:', validateData.user);
                console.log('Permissions:', validateData.permissions);
                
                console.log('');
                console.log('🎉 LIVE AUTHENTICATION SYSTEM IS WORKING! 🎉');
                console.log('');
                console.log('You can now:');
                console.log('✅ Login at: https://ticketmail.netlify.app/');
                console.log('✅ Use email: admin@ticketmail.com');
                console.log('✅ Use password: admin123456');
                console.log('');
                console.log('🔐 Remember to change the default password after first login!');
            } else {
                console.log('❌ Session validation failed');
            }
            
        } else {
            console.log('❌ Live login failed');
            console.log('Error:', loginData.error || 'Unknown error');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testLiveAuth();