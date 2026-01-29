const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createSupabaseAdminUser() {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Supabase environment variables not found');
      return;
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    console.log('👤 Creating admin user...');

    // Check if admin user already exists
    const { data: existingAdmin, error: checkError } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking for existing admin:', checkError);
      return;
    }

    if (existingAdmin) {
      console.log('✅ Admin user already exists:', existingAdmin.email);
      return;
    }

    // Create admin user
    const adminEmail = 'admin@ticketmail.com';
    const adminPassword = 'Admin123!'; // You should change this
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    const { data: newAdmin, error: createError } = await supabase
      .from('users')
      .insert({
        email: adminEmail,
        password_hash: passwordHash,
        full_name: 'System Administrator',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ Error creating admin user:', createError);
      return;
    }

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email:', adminEmail);
    console.log('🔑 Password:', adminPassword);
    console.log('⚠️  Please change the default password after first login!');

  } catch (error) {
    console.error('❌ Admin user creation failed:', error);
  }
}

createSupabaseAdminUser();