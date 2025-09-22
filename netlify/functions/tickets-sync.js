const { getUserSettings, saveTicket } = require('./lib/database');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Helper function to connect to IMAP
function connectToImap(settings) {
    return new Promise((resolve, reject) => {
        const imap = new Imap({
            user: settings.gmailAddress,
            password: settings.appPassword,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false
            }
        });

        imap.once('ready', () => {
            resolve(imap);
        });

        imap.once('error', (err) => {
            reject(err);
        });

        imap.connect();
    });
}

// Helper function to fetch emails
function fetchEmails(imap, searchCriteria = ['UNSEEN']) {
    return new Promise((resolve, reject) => {
        imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                reject(err);
                return;
            }

            imap.search(searchCriteria, (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!results || results.length === 0) {
                    resolve([]);
                    return;
                }

                const emails = [];
                const fetch = imap.fetch(results, { 
                    bodies: '',
                    markSeen: false // Don't mark as read automatically
                });

                fetch.on('message', (msg) => {
                    let emailData = {};
                    
                    msg.on('body', (stream) => {
                        let buffer = '';
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });
                        
                        stream.once('end', async () => {
                            try {
                                const parsed = await simpleParser(buffer);
                                emailData = {
                                    messageId: parsed.messageId,
                                    subject: parsed.subject,
                                    from: parsed.from?.text || parsed.from?.value?.[0]?.address,
                                    to: parsed.to?.text || parsed.to?.value?.[0]?.address,
                                    date: parsed.date,
                                    body: parsed.text || parsed.html?.replace(/<[^>]*>/g, '') || '',
                                    headers: parsed.headers
                                };
                            } catch (parseErr) {
                                console.error('Error parsing email:', parseErr);
                            }
                        });
                    });

                    msg.once('end', () => {
                        if (emailData.subject) {
                            emails.push(emailData);
                        }
                    });
                });

                fetch.once('error', (err) => {
                    reject(err);
                });

                fetch.once('end', () => {
                    resolve(emails);
                });
            });
        });
    });
}

// Helper function to determine if email is a ticket
function isTicketEmail(email) {
    const subject = email.subject.toLowerCase();
    const body = email.body.toLowerCase();
    
    // Common support/ticket keywords
    const ticketKeywords = [
        'support', 'help', 'issue', 'problem', 'bug', 'error',
        'question', 'inquiry', 'request', 'ticket', 'complaint',
        'feedback', 'assistance', 'urgent', 'emergency'
    ];
    
    return ticketKeywords.some(keyword => 
        subject.includes(keyword) || body.includes(keyword)
    );
}

// Helper function to auto-categorize ticket status
function categorizeTicket(email) {
    const subject = email.subject.toLowerCase();
    const body = email.body.toLowerCase();
    
    // Check for urgent keywords
    if (subject.includes('urgent') || subject.includes('emergency') || 
        body.includes('urgent') || body.includes('emergency')) {
        return 'open';
    }
    
    // Check for question/inquiry keywords
    if (subject.includes('question') || subject.includes('inquiry') ||
        body.includes('question') || body.includes('inquiry')) {
        return 'new';
    }
    
    // Default status
    return 'new';
}

exports.handler = async (event, context) => {
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

    let imap = null;

    try {
        console.log('Starting email sync process...');
        
        // Get user settings
        console.log('Fetching user settings...');
        const settings = await getUserSettings();
        console.log('Settings retrieved:', settings ? 'Found' : 'Not found');
        
        if (!settings) {
            console.log('No settings found, returning error');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'No Gmail settings found. Please configure your settings first.'
                })
            };
        }

        // Validate settings
        if (!settings.gmailAddress || !settings.appPassword) {
            console.log('Invalid settings - missing email or password');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Gmail settings are incomplete. Please check your email and app password.'
                })
            };
        }

        console.log('Attempting to connect to Gmail IMAP for:', settings.gmailAddress);
        
        // Connect to IMAP
        try {
            imap = await connectToImap(settings);
            console.log('Connected to Gmail successfully');
        } catch (imapError) {
            console.error('IMAP connection failed:', imapError);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Failed to connect to Gmail: ' + imapError.message
                })
            };
        }

        // Parse request body for options
        let options = {};
        try {
            if (event.body) {
                options = JSON.parse(event.body);
            }
        } catch (e) {
            // Ignore parsing errors, use defaults
        }

        // Set search criteria (default to last 7 days)
        const days = options.days || 7;
        const searchDate = new Date();
        searchDate.setDate(searchDate.getDate() - days);
        
        const searchCriteria = options.unreadOnly ? 
            ['UNSEEN'] : 
            ['SINCE', searchDate.toISOString().split('T')[0].replace(/-/g, '-')];

        // Fetch emails
        console.log('Fetching emails with criteria:', searchCriteria);
        const emails = await fetchEmails(imap, searchCriteria);
        console.log(`Found ${emails.length} emails`);

        // Process emails and save tickets
        let ticketsProcessed = 0;
        let ticketsSkipped = 0;

        for (const email of emails) {
            try {
                // Check if email should be treated as a ticket
                if (isTicketEmail(email)) {
                    const ticketStatus = categorizeTicket(email);
                    
                    const ticket = {
                        subject: email.subject,
                        from: email.from,
                        to: email.to,
                        body: email.body.substring(0, 5000), // Limit body size
                        status: ticketStatus,
                        messageId: email.messageId,
                        date: email.date
                    };

                    await saveTicket(ticket);
                    ticketsProcessed++;
                } else {
                    ticketsSkipped++;
                }
            } catch (ticketError) {
                console.error('Error processing ticket:', ticketError);
                // Continue processing other emails
            }
        }

        // Close IMAP connection
        if (imap) {
            imap.end();
        }

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: `Successfully synced ${ticketsProcessed} tickets`,
                details: {
                    emailsFound: emails.length,
                    ticketsProcessed: ticketsProcessed,
                    emailsSkipped: ticketsSkipped
                }
            })
        };

    } catch (error) {
        console.error('Critical error in tickets-sync function:', error);
        console.error('Error stack:', error.stack);
        
        // Make sure to close IMAP connection on error
        if (imap) {
            try {
                imap.end();
            } catch (e) {
                console.error('Error closing IMAP connection:', e);
            }
        }

        // Return appropriate error response
        let statusCode = 500;
        let errorMessage = 'Internal server error';

        if (error.message && error.message.includes('authentication')) {
            statusCode = 401;
            errorMessage = 'Gmail authentication failed. Please check your email and app password.';
        } else if (error.message && error.message.includes('connection')) {
            statusCode = 503;
            errorMessage = 'Unable to connect to Gmail. Please try again later.';
        } else if (error.message && error.message.includes('database')) {
            statusCode = 500;
            errorMessage = 'Database error: ' + error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        return {
            statusCode: statusCode,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: errorMessage,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
};