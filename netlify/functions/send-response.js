const { getUserSettings } = require('./lib/database');
const nodemailer = require('nodemailer');

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed. Use POST.'
            })
        };
    }

    try {
        const { ticketId, to, subject, message, sendCopy } = JSON.parse(event.body);

        // Validate input
        if (!ticketId || !to || !subject || !message) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required fields: ticketId, to, subject, message'
                })
            };
        }

        console.log(`Sending response for ticket ${ticketId} to ${to}`);

        // Get user settings for Gmail credentials
        const settings = await getUserSettings();
        
        if (!settings || !settings.gmailAddress || !settings.appPassword) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Gmail settings not configured'
                })
            };
        }

        // Create transporter for Gmail SMTP
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: settings.gmailAddress,
                pass: settings.appPassword
            }
        });

        // Email content
        const emailContent = `
${message}

---
This message was sent via TicketMail Support System
Ticket ID: ${ticketId}
        `.trim();

        // Mail options
        const mailOptions = {
            from: settings.gmailAddress,
            to: to,
            subject: subject,
            text: emailContent,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <div style="white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</div>
                    <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                    <small style="color: #666;">
                        This message was sent via TicketMail Support System<br>
                        Ticket ID: ${ticketId}
                    </small>
                </div>
            `
        };

        // Send email
        await transporter.sendMail(mailOptions);

        // Add to conversation history (if table exists)
        try {
            const { getDatabase } = require('./lib/database');
            const sql = getDatabase();

            await sql`
                INSERT INTO ticket_conversations (ticket_id, message_type, from_email, to_email, subject, message, created_at)
                VALUES (${ticketId}, 'outbound', ${settings.gmailAddress}, ${to}, ${subject}, ${message}, CURRENT_TIMESTAMP)
            `;
        } catch (conversationError) {
            console.log('Could not save to conversation history (table may not exist):', conversationError.message);
            // Continue without failing - conversation history is optional
        }

        // Send copy to self if requested
        if (sendCopy) {
            const copyOptions = {
                ...mailOptions,
                to: settings.gmailAddress,
                subject: `[COPY] ${subject}`,
                text: `Copy of response sent to ${to}:\n\n${emailContent}`,
                html: `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                        <p><strong>Copy of response sent to ${to}:</strong></p>
                        <div style="white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</div>
                        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                        <small style="color: #666;">
                            This message was sent via TicketMail Support System<br>
                            Ticket ID: ${ticketId}
                        </small>
                    </div>
                `
            };
            await transporter.sendMail(copyOptions);
        }

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Response sent successfully',
                ticketId: ticketId,
                sentTo: to,
                copySent: sendCopy
            })
        };

    } catch (error) {
        console.error('Error sending response:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Failed to send response: ' + error.message
            })
        };
    }
};