const { getDatabase } = require('./lib/database');
const crypto = require('crypto-js');

// Helper functions for encryption
function encryptData(text) {
    if (!text) return null;
    const secretKey = process.env.ENCRYPTION_KEY || 'default-secret-key';
    return crypto.AES.encrypt(text, secretKey).toString();
}

function decryptData(encryptedText) {
    if (!encryptedText) return null;
    try {
        const secretKey = process.env.ENCRYPTION_KEY || 'default-secret-key';
        const bytes = crypto.AES.decrypt(encryptedText, secretKey);
        return bytes.toString(crypto.enc.Utf8);
    } catch (error) {
        console.error('Error decrypting data:', error);
        return null;
    }
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    try {
        const sql = getDatabase();
        const authHeader = event.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Authorization required'
                })
            };
        }

        const sessionToken = authHeader.substring(7);

        // Verify session
        const session = await sql`
            SELECT u.id, u.username, u.is_admin 
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.session_token = ${sessionToken} 
            AND s.expires_at > CURRENT_TIMESTAMP
        `;

        if (session.length === 0) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid or expired session'
                })
            };
        }

        const user = session[0];

        // Create system_settings table if it doesn't exist
        await sql`
            CREATE TABLE IF NOT EXISTS system_settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(255) UNIQUE NOT NULL,
                setting_value TEXT,
                is_encrypted BOOLEAN DEFAULT FALSE,
                updated_by INTEGER REFERENCES users(id),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        if (event.httpMethod === 'GET') {
            // Get system settings (all users can read)
            const settings = await sql`
                SELECT setting_key, setting_value, is_encrypted
                FROM system_settings
                WHERE setting_key IN ('gmail_address', 'app_password', 'refresh_interval', 'default_status', 'imap_configured')
            `;

            const settingsObj = {};
            settings.forEach(setting => {
                if (setting.is_encrypted) {
                    settingsObj[setting.setting_key] = setting.setting_key === 'app_password' ? '***hidden***' : decryptData(setting.setting_value);
                } else {
                    settingsObj[setting.setting_key] = setting.setting_value;
                }
            });

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    settings: settingsObj
                })
            };

        } else if (event.httpMethod === 'POST') {
            // Save system settings (admin only)
            if (!user.is_admin) {
                return {
                    statusCode: 403,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: false,
                        error: 'Admin access required to modify settings'
                    })
                };
            }

            const { gmailAddress, appPassword, refreshInterval, defaultStatus } = JSON.parse(event.body);

            if (!gmailAddress || !appPassword) {
                return {
                    statusCode: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: false,
                        error: 'Gmail address and app password are required'
                    })
                };
            }

            // Encrypt sensitive data
            const encryptedPassword = encryptData(appPassword);

            // Save or update settings
            const settingsToSave = [
                { key: 'gmail_address', value: gmailAddress, encrypted: false },
                { key: 'app_password', value: encryptedPassword, encrypted: true },
                { key: 'refresh_interval', value: refreshInterval || 5, encrypted: false },
                { key: 'default_status', value: defaultStatus || 'new', encrypted: false },
                { key: 'imap_configured', value: 'true', encrypted: false }
            ];

            for (const setting of settingsToSave) {
                await sql`
                    INSERT INTO system_settings (setting_key, setting_value, is_encrypted, updated_by)
                    VALUES (${setting.key}, ${setting.value}, ${setting.encrypted}, ${user.id})
                    ON CONFLICT (setting_key) 
                    DO UPDATE SET 
                        setting_value = EXCLUDED.setting_value,
                        is_encrypted = EXCLUDED.is_encrypted,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = CURRENT_TIMESTAMP
                `;
            }

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    message: 'System settings saved successfully. All users can now access the ticket system.'
                })
            };
        }

    } catch (error) {
        console.error('System settings error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error: ' + error.message
            })
        };
    }
};