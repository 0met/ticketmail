const bcrypt = require('bcryptjs');
const { getDatabase: getSupabaseDB } = require('./database-supabase');
function getLocalDB() {
    // IMPORTANT: database-local depends on native sqlite3, which will crash on Netlify
    // if it's even imported on Linux when bundled from Windows.
    // Keep this require lazy so production (Supabase) never loads sqlite3.
    // eslint-disable-next-line global-require
    return require('./database-local').getDatabase();
}

function getDatabase() {
    // Prefer Supabase whenever it is configured.
    // Netlify Functions may not reliably set NODE_ENV, so don't depend on it.
    const hasSupabase = Boolean(
        process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
    );

    if (hasSupabase && process.env.FORCE_LOCAL_DB !== 'true') {
        console.log('🔌 Using Supabase Database Adapter (Auth)');
        return getSupabaseDB();
    }

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
    const db = await getDatabase();

    // Hash password
    const passwordHash = await hashPassword(userData.password);

    // Create user data object
    const userDataToInsert = {
        email: userData.email,
        password_hash: passwordHash,
        full_name: userData.fullName || null,
        role: userData.role || 'customer',
        company_id: userData.companyId || null,
        department: userData.department || null,
        job_title: userData.jobTitle || null,
        phone: userData.phone || null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // Create user using database method
    const user = await db.createUser(userDataToInsert);

    return {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        company_id: user.company_id,
        department: user.department,
        job_title: user.job_title,
        phone: user.phone
    };
}

async function authenticateUser(email, password) {
    const db = await getDatabase();

    // Get user by email
    const user = await db.getUserByEmail(email);

    if (!user) {
        console.log('No user found for email:', email);
        return { success: false, error: 'Invalid credentials' };
    }

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
    await db.updateUser(user.id, {
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.createSession({
        user_id: user.id,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
    });

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
    const db = await getDatabase();

    const session = await db.getSessionByToken(sessionToken);

    if (!session) {
        return { valid: false, error: 'Invalid or expired session' };
    }

    if (!session.users.is_active) {
        return { valid: false, error: 'User account is not active' };
    }

    return {
        valid: true,
        user: {
            id: session.user_id,
            email: session.users.email,
            fullName: session.users.full_name,
            role: session.users.role
        }
    };
}

async function getUserPermissions(userId) {
    const db = await getDatabase();
    const user = await db.getUserById(userId);

    if (!user) {
        return [];
    }

    // Basic role-based permissions
    switch (user.role) {
        case 'admin':
            return ['read', 'write', 'delete', 'manage_users', 'manage_system'];
        case 'agent':
            return ['read', 'write', 'manage_tickets'];
        case 'customer':
        default:
            return ['read', 'create_ticket'];
    }
}

async function logActivity(userId, action, resourceType, details, ipAddress) {
    const db = await getDatabase();

    await db.logActivity({
        user_id: userId,
        action: action,
        resource_type: resourceType,
        details: details || {},
        ip_address: ipAddress,
        created_at: new Date().toISOString()
    });
}

async function invalidateSession(sessionToken) {
    const db = await getDatabase();

    await db.deleteSession(sessionToken);

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