const { getUserSettings, saveTicket } = require('./lib/database');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Helper function to connect to IMAP with timeout
function connectToImap(settings, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('IMAP connection timeout'));
        }, timeoutMs);

        const imap = new Imap({
            user: settings.gmailAddress,
            password: settings.appPassword,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false
            },
            connTimeout: 10000,
            authTimeout: 5000
        });

        imap.once('ready', () => {
            clearTimeout(timeout);
            resolve(imap);
        });

        imap.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        try {
            imap.connect();
        } catch (error) {
            clearTimeout(timeout);
            reject(error);
        }
    });
}

// Fixed email fetching function with proper async handling
function fetchEmails(imap, searchCriteria = ['UNSEEN'], maxEmails = 10) {
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
                    console.log('No emails found matching search criteria');
                    resolve([]);
                    return;
                }

                // Limit the number of emails to process
                const emailIds = results.slice(0, maxEmails);
                console.log(`Processing ${emailIds.length} emails`);

                const emails = [];
                const emailPromises = [];

                const fetch = imap.fetch(emailIds, { 
                    bodies: '',
                    markSeen: false
                });

                fetch.on('message', (msg) => {
                    const emailPromise = new Promise((resolveEmail, rejectEmail) => {
                        let buffer = '';
                        
                        msg.on('body', (stream) => {
                            stream.on('data', (chunk) => {
                                buffer += chunk.toString('utf8');
                            });
                            
                            stream.once('end', async () => {
                                try {
                                    const parsed = await simpleParser(buffer);
                                    const emailData = {
                                        messageId: parsed.messageId,
                                        subject: parsed.subject || 'No Subject',
                                        from: parsed.from?.text || parsed.from?.value?.[0]?.address || 'Unknown',
                                        to: parsed.to?.text || parsed.to?.value?.[0]?.address || 'Unknown',
                                        date: parsed.date || new Date(),
                                        body: parsed.text || parsed.html?.replace(/<[^>]*>/g, '') || '',
                                        headers: parsed.headers
                                    };
                                    resolveEmail(emailData);
                                } catch (parseErr) {
                                    console.error('Error parsing email:', parseErr);
                                    resolveEmail(null); // Return null for failed emails
                                }
                            });
                        });

                        msg.once('error', (msgErr) => {
                            console.error('Message error:', msgErr);
                            resolveEmail(null);
                        });
                    });

                    emailPromises.push(emailPromise);
                });

                fetch.once('error', (err) => {
                    console.error('Fetch error:', err);
                    reject(err);
                });

                fetch.once('end', async () => {
                    try {
                        // Wait for all email parsing to complete
                        const parsedEmails = await Promise.all(emailPromises);
                        
                        // Filter out null emails (failed to parse)
                        const validEmails = parsedEmails.filter(email => email && email.subject);
                        
                        console.log(`Successfully parsed ${validEmails.length} emails`);
                        resolve(validEmails);
                    } catch (promiseErr) {
                        console.error('Error waiting for email parsing:', promiseErr);
                        reject(promiseErr);
                    }
                });
            });
        });
    });
}

// Helper function to determine if email is a ticket
function isTicketEmail(email) {
    const subject = (email.subject || '').toLowerCase();
    const body = (email.body || '').toLowerCase();
    
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

// Helper function to categorize ticket
function categorizeTicket(email) {
    const subject = (email.subject || '').toLowerCase();
    const body = (email.body || '').toLowerCase();
    
    if (subject.includes('urgent') || subject.includes('emergency') || body.includes('urgent')) {
        return 'urgent';
    }
    
    if (subject.includes('bug') || subject.includes('error') || body.includes('bug')) {
        return 'bug';
    }
    
    if (subject.includes('question') || subject.includes('inquiry')) {
        return 'question';
    }
    
    return 'general';
}

// Helper function to determine ticket status
function getTicketStatus(email) {
    // Default status
    return 'new';
}

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
                    error: 'Invalid Gmail settings. Missing email or app password.'
                })
            };
        }

        console.log('Attempting to connect to Gmail IMAP for:', settings.gmailAddress);
        
        // Connect to IMAP with timeout
        try {
            imap = await connectToImap(settings, 15000);
            console.log('Connected to Gmail successfully');
        } catch (imapError) {
            console.error('IMAP connection failed:', imapError);
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Failed to connect to Gmail: ' + imapError.message,
                    hint: 'Please verify your Gmail address and app password are correct.'
                })
            };
        }

        // Fetch emails
        console.log('Fetching emails...');
        const emails = await fetchEmails(imap, ['UNSEEN'], 5); // Limit to 5 emails for testing
        console.log(`Found ${emails.length} emails`);

        if (emails.length === 0) {
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    message: 'No new emails found',
                    processed: 0,
                    tickets: 0
                })
            };
        }

        // Process emails and create tickets
        console.log('Processing emails for tickets...');
        let ticketsCreated = 0;

        for (const email of emails) {
            try {
                // Check if this is a support ticket
                if (isTicketEmail(email)) {
                    console.log('Creating ticket for email:', email.subject);
                    
                    const ticket = {
                        subject: email.subject,
                        description: email.body.substring(0, 1000), // Limit description length
                        email: email.from,
                        status: getTicketStatus(email),
                        category: categorizeTicket(email),
                        priority: email.subject.toLowerCase().includes('urgent') ? 'high' : 'medium',
                        source: 'email',
                        metadata: {
                            messageId: email.messageId,
                            originalDate: email.date,
                            to: email.to
                        }
                    };

                    await saveTicket(ticket);
                    ticketsCreated++;
                    console.log(`Ticket created successfully for: ${email.subject}`);
                } else {
                    console.log('Email not identified as ticket:', email.subject);
                }
            } catch (ticketError) {
                console.error('Error creating ticket for email:', email.subject, ticketError);
                // Continue processing other emails
            }
        }

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: `Email sync completed successfully`,
                processed: emails.length,
                tickets: ticketsCreated,
                details: emails.map(email => ({
                    subject: email.subject,
                    from: email.from,
                    isTicket: isTicketEmail(email)
                }))
            })
        };

    } catch (error) {
        console.error('Error in email sync:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Email sync failed: ' + error.message
            })
        };
    } finally {
        // Always clean up IMAP connection
        if (imap) {
            try {
                imap.end();
                console.log('IMAP connection closed');
            } catch (cleanupError) {
                console.log('Error closing IMAP connection:', cleanupError.message);
            }
        }
    }
};