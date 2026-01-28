/**
 * Database Migration Script for User Management System
 * This script adds companies table and updates users/tickets tables
 * to support the company profile and user management features
 */

const { getDatabase } = require('./netlify/functions/lib/database-local');

async function runMigration() {
    console.log('🚀 Starting database migration for User Management System...\n');
    
    const sql = getDatabase();
    
    try {
        // Step 1: Create companies table
        console.log('📋 Step 1: Creating companies table...');
        await sql`
            CREATE TABLE IF NOT EXISTS companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(255) NOT NULL UNIQUE,
                domain VARCHAR(255),
                phone VARCHAR(20),
                address TEXT,
                industry VARCHAR(100),
                company_size VARCHAR(50),
                notes TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        console.log('   ✅ Companies table created successfully\n');
        
        // Step 2: Check and add columns to users table
        console.log('📋 Step 2: Updating users table...');
        
        // Check existing columns in users table
        const usersColumnsResult = await sql`PRAGMA table_info(users)`;
        const usersColumns = Array.isArray(usersColumnsResult) ? usersColumnsResult : Object.values(usersColumnsResult);
        const existingUserColumns = usersColumns.map(col => col.name);
        
        // Add missing columns
        if (!existingUserColumns.includes('company_id')) {
            await sql`ALTER TABLE users ADD COLUMN company_id INTEGER REFERENCES companies(id)`;
            console.log('   ✅ Added company_id column to users');
        }
        
        if (!existingUserColumns.includes('department')) {
            await sql`ALTER TABLE users ADD COLUMN department VARCHAR(100)`;
            console.log('   ✅ Added department column to users');
        }
        
        if (!existingUserColumns.includes('job_title')) {
            await sql`ALTER TABLE users ADD COLUMN job_title VARCHAR(100)`;
            console.log('   ✅ Added job_title column to users');
        }
        
        if (!existingUserColumns.includes('phone')) {
            await sql`ALTER TABLE users ADD COLUMN phone VARCHAR(20)`;
            console.log('   ✅ Added phone column to users');
        }
        
        console.log('   ✅ Users table updated successfully\n');
        
        // Step 3: Check and add columns to tickets table
        console.log('📋 Step 3: Updating tickets table...');
        
        // Check existing columns in tickets table
        const ticketsColumnsResult = await sql`PRAGMA table_info(tickets)`;
        const ticketsColumns = Array.isArray(ticketsColumnsResult) ? ticketsColumnsResult : Object.values(ticketsColumnsResult);
        const existingTicketColumns = ticketsColumns.map(col => col.name);
        
        // Add missing columns
        if (!existingTicketColumns.includes('company_id')) {
            await sql`ALTER TABLE tickets ADD COLUMN company_id INTEGER REFERENCES companies(id)`;
            console.log('   ✅ Added company_id column to tickets');
        }
        
        if (!existingTicketColumns.includes('assigned_to')) {
            await sql`ALTER TABLE tickets ADD COLUMN assigned_to INTEGER REFERENCES users(id)`;
            console.log('   ✅ Added assigned_to column to tickets');
        }
        
        console.log('   ✅ Tickets table updated successfully\n');
        
        // Step 4: Create indexes for performance
        console.log('📋 Step 4: Creating indexes...');
        
        try {
            await sql`CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id)`;
            console.log('   ✅ Created index on users.company_id');
        } catch (e) {
            console.log('   ℹ️  Index idx_users_company already exists');
        }
        
        try {
            await sql`CREATE INDEX IF NOT EXISTS idx_tickets_company ON tickets(company_id)`;
            console.log('   ✅ Created index on tickets.company_id');
        } catch (e) {
            console.log('   ℹ️  Index idx_tickets_company already exists');
        }
        
        try {
            await sql`CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to)`;
            console.log('   ✅ Created index on tickets.assigned_to');
        } catch (e) {
            console.log('   ℹ️  Index idx_tickets_assigned already exists');
        }
        
        try {
            await sql`CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active)`;
            console.log('   ✅ Created index on companies.is_active');
        } catch (e) {
            console.log('   ℹ️  Index idx_companies_active already exists');
        }
        
        try {
            await sql`CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name)`;
            console.log('   ✅ Created index on companies.name');
        } catch (e) {
            console.log('   ℹ️  Index idx_companies_name already exists');
        }
        
        console.log('   ✅ Indexes created successfully\n');
        
        // Step 5: Insert sample data (optional)
        console.log('📋 Step 5: Checking for sample data...');
        
        const existingCompanies = await sql`SELECT COUNT(*) as count FROM companies`;
        
        if (existingCompanies[0].count === 0) {
            console.log('   📝 No companies found. Creating sample companies...');
            
            // Insert sample companies
            await sql`
                INSERT INTO companies (name, domain, phone, industry, company_size, is_active)
                VALUES 
                    ('Acme Corporation', 'acme.com', '555-0100', 'technology', 'large', 1),
                    ('Global Dynamics', 'globaldynamics.com', '555-0200', 'finance', 'enterprise', 1),
                    ('Tech Innovations', 'techinnovations.com', '555-0300', 'technology', 'medium', 1)
            `;
            
            console.log('   ✅ Sample companies created\n');
        } else {
            console.log('   ℹ️  Companies already exist, skipping sample data\n');
        }
        
        // Step 6: Verify migration
        console.log('📋 Step 6: Verifying migration...');
        
        const companiesCount = await sql`SELECT COUNT(*) as count FROM companies`;
        console.log(`   ✅ Companies table: ${companiesCount[0].count} records`);
        
        const usersCount = await sql`SELECT COUNT(*) as count FROM users`;
        console.log(`   ✅ Users table: ${usersCount[0].count} records`);
        
        const ticketsCount = await sql`SELECT COUNT(*) as count FROM tickets`;
        console.log(`   ✅ Tickets table: ${ticketsCount[0].count} records`);
        
        console.log('\n✨ Migration completed successfully!');
        console.log('\n📚 Next steps:');
        console.log('   1. Refresh your application to see the new user management features');
        console.log('   2. Navigate to the User Management page in your app');
        console.log('   3. Start creating companies and associating users with them');
        console.log('   4. Assign tickets to specific companies for better organization\n');
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        console.error('Error details:', error.message);
        process.exit(1);
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    runMigration()
        .then(() => {
            console.log('✅ Migration script completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { runMigration };
