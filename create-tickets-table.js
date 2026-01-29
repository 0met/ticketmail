require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createTicketsTable() {
  console.log('🏗️ Creating tickets table...');

  const sql = `
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      ticket_number VARCHAR(20) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'open',
      priority VARCHAR(20) DEFAULT 'medium',
      category VARCHAR(100),
      created_by INTEGER REFERENCES users(id),
      assigned_to INTEGER REFERENCES users(id),
      customer_name VARCHAR(255),
      customer_email VARCHAR(255),
      customer_company VARCHAR(255),
      customer_phone VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      closed_at TIMESTAMP WITH TIME ZONE,
      tags TEXT[],
      attachments JSONB,
      metadata JSONB
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_number ON tickets(ticket_number);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
    CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by);
    CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);

    ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
  `;

  try {
    console.log('📋 Run this SQL in your Supabase SQL Editor:');
    console.log('='.repeat(50));
    console.log(sql);
    console.log('='.repeat(50));
    console.log('\n✅ Tickets table SQL generated successfully!');
    console.log('📝 Copy and paste the SQL above into your Supabase SQL Editor and run it.');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createTicketsTable();