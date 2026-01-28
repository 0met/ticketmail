-- User Management System Database Schema
-- This script sets up companies, users, and their relationships with tickets

-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    domain VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    industry VARCHAR(100),
    company_size VARCHAR(50), -- 'small', 'medium', 'large', 'enterprise'
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add company_id to users table if it doesn't exist
-- This links users to their companies
ALTER TABLE users ADD COLUMN company_id INTEGER REFERENCES companies(id);
ALTER TABLE users ADD COLUMN department VARCHAR(100);
ALTER TABLE users ADD COLUMN job_title VARCHAR(100);
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- Add company_id to tickets table if it doesn't exist
-- This links tickets to companies
ALTER TABLE tickets ADD COLUMN company_id INTEGER REFERENCES companies(id);
ALTER TABLE tickets ADD COLUMN assigned_to INTEGER REFERENCES users(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_company ON tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);

-- Create a view for company statistics
CREATE VIEW IF NOT EXISTS company_stats AS
SELECT 
    c.id,
    c.name,
    c.domain,
    COUNT(DISTINCT u.id) as user_count,
    COUNT(DISTINCT t.id) as ticket_count,
    COUNT(DISTINCT CASE WHEN t.status = 'new' THEN t.id END) as new_tickets,
    COUNT(DISTINCT CASE WHEN t.status = 'open' THEN t.id END) as open_tickets,
    COUNT(DISTINCT CASE WHEN t.status = 'pending' THEN t.id END) as pending_tickets,
    COUNT(DISTINCT CASE WHEN t.status = 'closed' THEN t.id END) as closed_tickets
FROM companies c
LEFT JOIN users u ON u.company_id = c.id
LEFT JOIN tickets t ON t.company_id = c.id
GROUP BY c.id, c.name, c.domain;
