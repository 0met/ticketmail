const { getDatabase } = require('./lib/database');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    try {
        const sql = getDatabase();

        console.log('Creating user management tables...');

        // Create users table
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'agent' CHECK (role IN ('admin', 'agent', 'customer')),
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
                avatar_url TEXT,
                phone VARCHAR(50),
                timezone VARCHAR(100) DEFAULT 'America/New_York',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                login_attempts INTEGER DEFAULT 0,
                locked_until TIMESTAMP,
                email_verified BOOLEAN DEFAULT false,
                preferences JSONB DEFAULT '{}'::jsonb
            )
        `;

        // Create user sessions table
        await sql`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                session_token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ip_address INET,
                user_agent TEXT
            )
        `;

        // Create permissions table
        await sql`
            CREATE TABLE IF NOT EXISTS permissions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                resource VARCHAR(100) NOT NULL,
                action VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // Create role_permissions table
        await sql`
            CREATE TABLE IF NOT EXISTS role_permissions (
                role VARCHAR(50) NOT NULL,
                permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
                granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (role, permission_id)
            )
        `;

        // Add user assignment to tickets table
        await sql`
            ALTER TABLE tickets 
            ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS tags TEXT[]
        `;

        // Create activity log table
        await sql`
            CREATE TABLE IF NOT EXISTS activity_log (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id),
                ticket_id UUID REFERENCES tickets(id),
                action VARCHAR(100) NOT NULL,
                details JSONB,
                ip_address INET,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // Insert default permissions
        const defaultPermissions = [
            // Ticket permissions
            { name: 'view_tickets', description: 'View tickets', resource: 'tickets', action: 'read' },
            { name: 'create_tickets', description: 'Create new tickets', resource: 'tickets', action: 'create' },
            { name: 'edit_tickets', description: 'Edit ticket details', resource: 'tickets', action: 'update' },
            { name: 'delete_tickets', description: 'Delete tickets', resource: 'tickets', action: 'delete' },
            { name: 'assign_tickets', description: 'Assign tickets to users', resource: 'tickets', action: 'assign' },
            { name: 'close_tickets', description: 'Close tickets', resource: 'tickets', action: 'close' },
            
            // User permissions
            { name: 'view_users', description: 'View user list', resource: 'users', action: 'read' },
            { name: 'create_users', description: 'Create new users', resource: 'users', action: 'create' },
            { name: 'edit_users', description: 'Edit user details', resource: 'users', action: 'update' },
            { name: 'delete_users', description: 'Delete users', resource: 'users', action: 'delete' },
            
            // Admin permissions
            { name: 'manage_settings', description: 'Manage system settings', resource: 'system', action: 'manage' },
            { name: 'view_analytics', description: 'View analytics dashboard', resource: 'analytics', action: 'read' },
            { name: 'manage_permissions', description: 'Manage user permissions', resource: 'permissions', action: 'manage' }
        ];

        for (const perm of defaultPermissions) {
            await sql`
                INSERT INTO permissions (name, description, resource, action)
                VALUES (${perm.name}, ${perm.description}, ${perm.resource}, ${perm.action})
                ON CONFLICT (name) DO NOTHING
            `;
        }

        // Set up default role permissions
        const rolePermissions = {
            admin: ['view_tickets', 'create_tickets', 'edit_tickets', 'delete_tickets', 'assign_tickets', 'close_tickets',
                   'view_users', 'create_users', 'edit_users', 'delete_users', 'manage_settings', 'view_analytics', 'manage_permissions'],
            agent: ['view_tickets', 'create_tickets', 'edit_tickets', 'assign_tickets', 'close_tickets', 'view_analytics'],
            customer: ['view_tickets', 'create_tickets']
        };

        for (const [role, permissions] of Object.entries(rolePermissions)) {
            for (const permName of permissions) {
                await sql`
                    INSERT INTO role_permissions (role, permission_id)
                    SELECT ${role}, id FROM permissions WHERE name = ${permName}
                    ON CONFLICT (role, permission_id) DO NOTHING
                `;
            }
        }

        // Create indexes for performance
        await sql`CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_tickets_status_priority ON tickets(status, priority)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_tickets_sla_due ON tickets(sla_due_at)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_activity_log_ticket ON activity_log(ticket_id)`;

        console.log('✅ User management schema created successfully');

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'User management schema created successfully',
                details: {
                    tablesCreated: ['users', 'user_sessions', 'permissions', 'role_permissions', 'activity_log'],
                    ticketsModified: 'Added assignment and SLA fields',
                    permissionsCreated: defaultPermissions.length,
                    rolesConfigured: Object.keys(rolePermissions)
                }
            })
        };

    } catch (error) {
        console.error('Error creating user management schema:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};