const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');
const { getDatabase: getLocalDB } = require('./database-local');

function getDatabase() {
    // FORCE LOCAL DB
    console.log('🔌 Using Local SQLite Database Adapter (Auth)');
    return getLocalDB();
}
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
        INSERT INTO users (email, password_hash, full_name, role, company_id, department, job_title, phone)
        VALUES (${userData.email}, ${passwordHash}, ${userData.fullName}, 
                ${userData.role || 'customer'}, ${userData.companyId || null},
                ${userData.department || null}, ${userData.jobTitle || null}, ${userData.phone || null})
        RETURNING id, email, full_name, role, is_active, created_at, company_id, department, job_title, phone
    `;

    return user[0];
}

async function authenticateUser(email, password) {
    const sql = getDatabase();

    // Get user with password
    const users = await sql`
        SELECT id, email, password_hash, full_name, role, is_active
        FROM users 
        WHERE email = ${email}
    `;

    if (users.length === 0) {
        console.log('No user found for email:', email);
        return { success: false, error: 'Invalid credentials' };
    }

    const user = users[0];
    console.log('User from DB:', user);
    console.log('Password from input:', password);
    console.log('Password hash from DB:', user.password_hash);

    // Check if account is active
    if (!user.is_active) {
        console.log('Account is not active for user:', email);
        return { success: false, error: 'Account is not active' };
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    console.log('Password valid?', isValidPassword);

    if (!isValidPassword) {
        return { success: false, error: 'Invalid credentials' };
    }

    // Update last login
    await sql`
        UPDATE users 
        SET last_login = CURRENT_TIMESTAMP
        WHERE id = ${user.id}
    `;

    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await sql`
        INSERT INTO sessions (user_id, session_token, expires_at)
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
        SELECT s.user_id, s.expires_at, u.email, u.full_name, u.role, u.is_active
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.session_token = ${sessionToken} AND s.expires_at > CURRENT_TIMESTAMP
    `;

    if (sessions.length === 0) {
        return { valid: false, error: 'Invalid or expired session' };
    }

    const session = sessions[0];

    if (!session.is_active) {
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
        SELECT permission_type
        FROM permissions
        WHERE user_id = ${userId}
    `;

    return permissions.map(p => p.permission_type);
}

async function logActivity(userId, action, resourceType, details, ipAddress) {
    const sql = getDatabase();

    await sql`
        INSERT INTO activity_log (user_id, action, resource_type, details, ip_address)
        VALUES (${userId}, ${action}, ${resourceType}, ${details ? JSON.stringify(details) : null}, ${ipAddress})
    `;
}

async function invalidateSession(sessionToken) {
    const sql = getDatabase();

    await sql`
        DELETE FROM sessions 
        WHERE session_token = ${sessionToken}
    `;

    return true;
}

module.exports = {
    createUser,
    authenticateUser,
    validateSession,
    getUserPermissions,
    logActivity,
    invalidateSession,
    hashPassword,
    verifyPassword
};