const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testSupabaseConnection() {
  try {
    console.log('🧪 Testing Supabase Connection...\n');

    // Check environment variables
    console.log('📋 Environment Variables:');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing');
    console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');
    console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');
    console.log('');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Required environment variables are missing');
      return;
    }

    // Test connection with service role key
    console.log('🔗 Testing database connection...');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Try to get table info (this will fail if tables don't exist, but connection should work)
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) {
      if (error.message.includes('relation "public.users" does not exist')) {
        console.log('✅ Connection successful! (Tables not created yet)');
      } else {
        console.log('⚠️  Connection issue:', error.message);
      }
    } else {
      console.log('✅ Connection successful and tables exist!');
    }

    // Test auth functions
    console.log('\n🔐 Testing auth functions...');
    const { getDatabase } = require('./netlify/functions/lib/database-supabase');

    try {
      const db = await getDatabase();
      console.log('✅ Database adapter initialized successfully');
    } catch (err) {
      console.log('❌ Database adapter failed:', err.message);
    }

    console.log('\n🎉 Supabase integration test complete!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSupabaseConnection();