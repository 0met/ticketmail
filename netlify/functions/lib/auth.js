const { getDatabase } = require('./lib/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Helper function to generate session token
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Helper function to hash passwords
async function hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
}

// Helper function to verify passwords
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

async function createUser(userData) {
    const sql = getDatabase();
    
    // Hash password
    const passwordHash = await hashPassword(userData.password);
    
    // Create user
    const user = await sql`
        INSERT INTO users (email, password_hash, full_name, role, phone, timezone)
        VALUES (${userData.email}, ${passwordHash}, ${userData.fullName}, 
                ${userData.role || 'agent'}, ${userData.phone || null}, 
                ${userData.timezone || 'America/New_York'})
        RETURNING id, email, full_name, role, status, created_at
    `;
    
    return user[0];
}

async function authenticateUser(email, password) {
    const sql = getDatabase();
    
    // Get user with password
    const users = await sql`
        SELECT id, email, password_hash, full_name, role, status, login_attempts, locked_until
        FROM users 
        WHERE email = ${email}
    `;
    
    if (users.length === 0) {
        return { success: false, error: 'Invalid credentials' };
    }
    
    const user = users[0];
    
    // Check if account is locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
        return { success: false, error: 'Account temporarily locked due to too many failed attempts' };
    }
    
    // Check if account is active
    if (user.status !== 'active') {
        return { success: false, error: 'Account is not active' };
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
        // Increment login attempts
        const attempts = (user.login_attempts || 0) + 1;
        const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null; // Lock for 15 minutes
        
        await sql`
            UPDATE users 
            SET login_attempts = ${attempts}, 
                locked_until = ${lockUntil}
            WHERE id = ${user.id}
        `;
        
        return { success: false, error: 'Invalid credentials' };
    }
    
    // Reset login attempts and update last login
    await sql`
        UPDATE users 
        SET login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP
        WHERE id = ${user.id}
    `;
    
    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    await sql`
        INSERT INTO user_sessions (user_id, session_token, expires_at)
        VALUES (${user.id}, ${sessionToken}, ${expiresAt})
    `;
    
    return {
        success: true,
        user: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            role: user.role
        },
        sessionToken,
        expiresAt
    };
}

async function validateSession(sessionToken) {
    const sql = getDatabase();
    
    const sessions = await sql`
        SELECT s.user_id, s.expires_at, u.email, u.full_name, u.role, u.status
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.session_token = ${sessionToken} AND s.expires_at > CURRENT_TIMESTAMP
    `;
    
    if (sessions.length === 0) {
        return { valid: false, error: 'Invalid or expired session' };
    }
    
    const session = sessions[0];
    
    if (session.status !== 'active') {
        return { valid: false, error: 'User account is not active' };
    }
    
    return {
        valid: true,
        user: {
            id: session.user_id,
            email: session.email,
            fullName: session.full_name,
            role: session.role
        }
    };
}

async function getUserPermissions(userId) {
    const sql = getDatabase();
    
    const permissions = await sql`
        SELECT DISTINCT p.name, p.resource, p.action
        FROM users u
        JOIN role_permissions rp ON u.role = rp.role
        JOIN permissions p ON rp.permission_id = p.id
        WHERE u.id = ${userId}
    `;
    
    return permissions.map(p => p.name);
}

async function logActivity(userId, ticketId, action, details, ipAddress) {
    const sql = getDatabase();
    
    await sql`
        INSERT INTO activity_log (user_id, ticket_id, action, details, ip_address)
        VALUES (${userId}, ${ticketId}, ${action}, ${details ? JSON.stringify(details) : null}, ${ipAddress})
    `;
}

module.exports = {
    createUser,
    authenticateUser,
    validateSession,
    getUserPermissions,
    logActivity,
    hashPassword,
    verifyPassword
};