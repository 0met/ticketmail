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
                                                            headers: parsed.headers,
                                                            uid: msg && msg.attributes && msg.attributes.uid ? msg.attributes.uid : null
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
                        // Collect UIDs for marking seen later
                        const uids = validEmails.map(e => e.uid).filter(Boolean);
                        resolve({ emails: validEmails, uids });
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
    const from = (email.from || '').toLowerCase();
    
    // Skip automated/system emails
    const skipKeywords = [
        'noreply', 'no-reply', 'donotreply', 'do-not-reply',
        'automated', 'notification', 'mailer-daemon', 
        'postmaster', 'delivery-status', 'bounced',
        'unsubscribe', 'newsletter', 'marketing'
    ];
    
    // Check if it's an automated email we should skip
    const isAutomated = skipKeywords.some(keyword => 
        from.includes(keyword) || subject.includes(keyword) || body.includes(keyword)
    );
    
    if (isAutomated) {
        console.log(`Skipping automated email: ${subject}`);
        return false;
    }
    
    // Convert all other emails to tickets (inclusive approach)
    // This is more appropriate for a customer support system
    return true;
}

// Helper function to categorize ticket
function categorizeTicket(email) {
    const subject = (email.subject || '').toLowerCase();
    const body = (email.body || '').toLowerCase();
    
    if (subject.includes('password') || subject.includes('login') || subject.includes('access') || body.includes('password')) {
        return 'account';
    }
    
    if (subject.includes('payment') || subject.includes('billing') || subject.includes('invoice') || body.includes('billing')) {
        return 'billing';
    }
    
    if (subject.includes('bug') || subject.includes('error') || subject.includes('issue') || subject.includes('problem') || body.includes('bug')) {
        return 'technical';
    }
    
    if (subject.includes('feature') || subject.includes('request') || subject.includes('enhancement') || body.includes('feature')) {
        return 'feature-request';
    }
    
    if (subject.includes('help') || subject.includes('how to') || subject.includes('tutorial') || body.includes('help')) {
        return 'support';
    }
    
    if (subject.includes('urgent') || subject.includes('emergency') || body.includes('urgent')) {
        return 'urgent';
    }
    
    return 'general';
}

// Helper function to determine ticket priority
function determinePriority(email) {
    const subject = (email.subject || '').toLowerCase();
    const body = (email.body || '').toLowerCase();
    
    // Check for critical indicators
    if (subject.includes('critical') || subject.includes('down') || subject.includes('emergency') || 
        body.includes('critical') || body.includes('emergency') || body.includes('system down')) {
        return 'critical';
    }
    
    // Check for high priority indicators
    if (subject.includes('urgent') || subject.includes('asap') || subject.includes('high priority') ||
        body.includes('urgent') || body.includes('asap') || subject.includes('!!!')) {
        return 'high';
    }
    
    // Check for low priority indicators
    if (subject.includes('low priority') || subject.includes('when you have time') ||
        body.includes('low priority') || body.includes('no rush')) {
        return 'low';
    }
    
    // Default to medium priority
    return 'medium';
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
        
        // Get user settings with enhanced error handling
        console.log('Fetching user settings...');
        let settings;
        try {
            settings = await getUserSettings();
            console.log('Settings retrieved:', settings ? 'Found' : 'Not found');
        } catch (settingsError) {
            console.error('Error getting user settings:', settingsError);
            console.error('Settings error stack:', settingsError.stack);
            
            // Check if it's a table not found error
            if (settingsError.message.includes('relation "user_settings" does not exist') || 
                settingsError.message.includes('user_settings')) {
                return {
                    statusCode: 400,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: false,
                        error: 'User settings table does not exist. Database needs to be initialized.',
                        hint: 'Contact administrator to initialize the user_settings table.'
                    })
                };
            }
            
            // For other database errors
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Database error while fetching settings: ' + settingsError.message,
                    details: settingsError.stack
                })
            };
        }
        
        if (!settings) {
            console.log('No settings found in database - likely not configured yet');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Gmail settings not found in database. Please save your Gmail settings first.',
                    hint: 'Go to Settings page and click "Save Settings" to store your Gmail configuration in the database.'
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

            // Parse request body for optional test flags
            let requestBody = {};
            try {
                requestBody = event.body ? JSON.parse(event.body) : {};
            } catch (parseErr) {
                console.log('Could not parse request body, proceeding with defaults');
                requestBody = {};
            }

            const queryTestAll = event.queryStringParameters && (event.queryStringParameters.testAll === 'true' || event.queryStringParameters.testAll === '1');
            const testAll = requestBody.testAll === true || queryTestAll === true;

        // Fetch emails
            console.log('Fetching emails...');
            const searchCriteria = testAll ? ['ALL'] : ['UNSEEN'];
            const maxEmails = testAll ? (requestBody.maxEmails || 50) : 5; // larger for testAll
            console.log(`Using search criteria: ${JSON.stringify(searchCriteria)}, maxEmails: ${maxEmails}`);
        const fetched = await fetchEmails(imap, searchCriteria, maxEmails);
        const emails = Array.isArray(fetched) ? fetched : (fetched.emails || []);
        const fetchedUids = fetched && fetched.uids ? fetched.uids : [];
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

        // Log parsed email subjects for debugging
        try {
            const parsedSubjects = emails.map(e => e && e.subject ? e.subject : '(no subject)');
            console.log('DEBUGGING: Parsed email subjects:', parsedSubjects.slice(0, 20));
        } catch (slogErr) {
            console.log('Error logging parsed subjects:', slogErr.message);
        }

        for (const email of emails) {
            try {
                // Check if this is a support ticket
                if (isTicketEmail(email)) {
                    console.log('Creating ticket for email:', email.subject);
                    
                    const ticket = {
                        subject: email.subject,
                        from: email.from,
                        to: email.to,
                        body: email.body.substring(0, 1000), // Limit description length
                        status: getTicketStatus(email),
                        priority: determinePriority(email),
                        category: categorizeTicket(email),
                        messageId: email.messageId,
                        date: email.date,
                        isManual: false,
                        source: 'email'
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

        // Mark processed messages as Seen to avoid re-processing
        if (fetchedUids && fetchedUids.length > 0) {
            try {
                console.log('Marking processed messages as \\Seen for uids:', fetchedUids.slice(0, 10));
                imap.addFlags(fetchedUids, '\\Seen', (err) => {
                    if (err) console.error('Error marking messages as Seen:', err.message || err);
                    else console.log('Successfully marked messages as Seen');
                });
            } catch (flagErr) {
                console.error('Exception while setting flags:', flagErr.message || flagErr);
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
                    subject: email && email.subject ? email.subject : null,
                    from: email && email.from ? email.from : null,
                    isTicket: !!email && isTicketEmail(email)
                })),
                debug: {
                    testAll: testAll,
                    searchCriteria: searchCriteria,
                    maxEmails: maxEmails
                }
            })
        };

    } catch (error) {
        console.error('Error in email sync:', error);
        console.error('Error stack:', error.stack);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Email sync failed: ' + error.message,
                details: error.stack,
                timestamp: new Date().toISOString()
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