const { getDatabase, getUserSettings, saveTicket, touchUserSettingsUpdatedAt, recordLastSyncResult } = require('./lib/database');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

function sanitizeSearchCriteria(criteria) {
    if (!criteria) return ['UNSEEN'];
    if (!Array.isArray(criteria)) return [String(criteria)];
    // node-imap can crash if it receives null/undefined criteria elements
    return criteria.filter((c) => c !== null && c !== undefined);
}

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
function fetchEmails(imap, searchCriteria = [['OR', 'UNSEEN', ['SINCE', new Date(Date.now() - 24 * 60 * 60 * 1000)]]], maxEmails = 10) {
    return new Promise((resolve, reject) => {
        imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                reject(err);
                return;
            }

            const safeCriteria = sanitizeSearchCriteria(searchCriteria);
            imap.search(safeCriteria, (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!results || results.length === 0) {
                    console.log('No emails found matching search criteria');
                    resolve([]);
                    return;
                }

                // Limit the number of emails to process.
                // IMAP search results are typically oldest->newest; we want the MOST RECENT messages
                // so we don't get stuck reprocessing the same old set when maxEmails is small.
                const sorted = results
                    .slice()
                    .sort((a, b) => Number(a) - Number(b));
                const emailIds = sorted.slice(-maxEmails);
                console.log(`Processing ${emailIds.length} emails (most recent)`);

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

function isDuplicateTicketError(error) {
    if (!error) return false;
    const message = String(error.message || '').toLowerCase();
    const code = String(error.code || '').toLowerCase();
    return (
        code === '23505' ||
        message.includes('duplicate') ||
        message.includes('unique constraint') ||
        message.includes('message_id')
    );
}

function extractTicketNumberFromSubject(subject) {
    if (!subject) return null;
    const raw = String(subject);
    // Accept both bare and bracketed ticket numbers.
    // Examples: TK-2026-000123, [TK-2026-000123]
    const match = raw.match(/\bTK-\d{4}-\d{4,}\b/i);
    if (!match || !match[0]) return null;
    return match[0].toUpperCase();
}

function isColumnMissingErrorMessage(error) {
    const msg = String(error && error.message ? error.message : '').toLowerCase();
    return msg.includes('column') && msg.includes('does not exist');
}

function isUniqueViolation(error) {
    if (!error) return false;
    const code = String(error.code || '').toLowerCase();
    const msg = String(error.message || '').toLowerCase();
    return code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint');
}

async function findExistingTicketByNumber(ticketNumber) {
    if (!ticketNumber) return null;

    try {
        const supabase = getDatabase();
        if (!supabase || typeof supabase.from !== 'function') {
            return null;
        }

        const { data, error } = await supabase
            .from('tickets')
            .select('id, ticket_number')
            .eq('ticket_number', ticketNumber)
            .limit(1);

        if (error) {
            if (isColumnMissingErrorMessage(error)) {
                return null;
            }
            console.warn('Ticket lookup by ticket_number failed:', error.message);
            return null;
        }

        if (data && data.length > 0) {
            return data[0];
        }

        return null;
    } catch (error) {
        console.warn('Exception while looking up ticket by number:', error && error.message ? error.message : error);
        return null;
    }
}

async function attachInboundEmailToTicket({ ticketId, email }) {
    try {
        const supabase = getDatabase();
        if (!supabase || typeof supabase.from !== 'function') {
            return { ok: false, reason: 'no_supabase' };
        }

        const payload = {
            ticket_id: ticketId,
            email_message_id: email.messageId || email.message_id || null,
            message_type: 'inbound',
            from_email: email.from || null,
            to_email: email.to || null,
            subject: email.subject || null,
            message: (email.body || '').slice(0, 8000)
        };

        let insertError = null;
        try {
            const { error } = await supabase
                .from('ticket_conversations')
                .insert(payload);
            insertError = error;
        } catch (e) {
            insertError = e;
        }

        if (insertError) {
            const msg = String(insertError.message || '').toLowerCase();
            if (msg.includes('ticket_conversations') && (msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache'))) {
                return { ok: false, reason: 'missing_table' };
            }

            // If the table exists but the column doesn't (older schema), retry without email_message_id.
            if (isColumnMissingErrorMessage(insertError)) {
                const fallback = {
                    ticket_id: ticketId,
                    message_type: 'inbound',
                    from_email: email.from || null,
                    to_email: email.to || null,
                    subject: email.subject || null,
                    message: (email.body || '').slice(0, 8000)
                };
                const { error: fallbackError } = await supabase
                    .from('ticket_conversations')
                    .insert(fallback);
                if (fallbackError) {
                    if (isUniqueViolation(fallbackError)) {
                        return { ok: true, deduped: true };
                    }
                    console.warn('Failed to insert inbound conversation row (fallback):', fallbackError.message);
                    return { ok: false, reason: 'insert_failed' };
                }
                return { ok: true, fallback: true };
            }

            if (isUniqueViolation(insertError)) {
                return { ok: true, deduped: true };
            }

            console.warn('Failed to insert inbound conversation row:', insertError.message);
            return { ok: false, reason: 'insert_failed' };
        }

        // Best-effort bump updated_at
        try {
            await supabase
                .from('tickets')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', ticketId);
        } catch (_) {
            // ignore
        }

        return { ok: true };
    } catch (error) {
        console.warn('Exception while attaching inbound email:', error && error.message ? error.message : error);
        return { ok: false, reason: 'exception' };
    }
}

function isMissingTicketsTableError(error) {
    const msg = String(error && error.message ? error.message : error).toLowerCase();
    return (
        msg.includes("could not find the table 'public.tickets'") ||
        (msg.includes('tickets') && msg.includes('schema cache')) ||
        msg.includes('relation "tickets" does not exist') ||
        msg.includes('relation tickets does not exist')
    );
}

async function verifyTicketsTableExists() {
    const supabase = getDatabase();
    if (!supabase || typeof supabase.from !== 'function') {
        // Local DB adapter path; nothing to verify here.
        return { ok: true };
    }

    const { error } = await supabase
        .from('tickets')
        .select('id')
        .limit(1);

    if (!error) {
        return { ok: true };
    }

    if (isMissingTicketsTableError(error)) {
        return {
            ok: false,
            statusCode: 400,
            error: 'Tickets table does not exist in Supabase yet. Initialize the tickets table first, then retry syncing.',
            hint: 'Visit /.netlify/functions/init-tickets-table (requires SUPABASE_DB_URL configured) OR create the tickets table in Supabase SQL editor.'
        };
    }

    return { ok: false, statusCode: 500, error: `Database error while verifying tickets table: ${error.message}` };
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    // Handle CORS preflight requests
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

    // Allow GET (easy manual testing in browser) and POST (used by UI + scheduled sync)
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed. Use GET or POST.'
            })
        };
    }

    let imap = null;
    const syncStartedAt = new Date().toISOString();

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

            await recordLastSyncResult({
                at: syncStartedAt,
                status: 'fail',
                message: `Database error while fetching settings: ${settingsError.message}`
            });
            
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

            await recordLastSyncResult({
                at: syncStartedAt,
                status: 'fail',
                message: 'Gmail settings not found in database'
            });

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

            await recordLastSyncResult({
                at: syncStartedAt,
                status: 'fail',
                message: 'Invalid Gmail settings: missing email or app password'
            });

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

        // Fail fast if the tickets table is missing, before connecting to IMAP.
        const ticketsCheck = await verifyTicketsTableExists();
        if (!ticketsCheck.ok) {

            await recordLastSyncResult({
                at: syncStartedAt,
                status: 'fail',
                message: ticketsCheck.error
            });

            return {
                statusCode: ticketsCheck.statusCode || 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: ticketsCheck.error,
                    hint: ticketsCheck.hint
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

            await recordLastSyncResult({
                at: syncStartedAt,
                status: 'fail',
                message: `Failed to connect to Gmail: ${imapError.message}`
            });

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

            const queryDebug = event.queryStringParameters && (event.queryStringParameters.debug === 'true' || event.queryStringParameters.debug === '1');
            const debug = requestBody.debug === true || queryDebug === true;

        // Fetch emails
            console.log('Fetching emails...');
            // Default behavior should be resilient even if emails are marked as read.
            // Use UNSEEN OR SINCE (last 24h) then de-dup via message_id in DB.
            const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const searchCriteria = testAll
                ? ['ALL']
                : [['OR', 'UNSEEN', ['SINCE', sinceDate]]];
            const maxEmails = testAll ? (requestBody.maxEmails || 50) : 10; // larger default to reduce "stuck" behavior
            console.log(`Using search criteria: ${JSON.stringify(searchCriteria)}, maxEmails: ${maxEmails}`);
        const fetched = await fetchEmails(imap, searchCriteria, maxEmails);
        const emails = Array.isArray(fetched) ? fetched : (fetched.emails || []);
        const fetchedUids = fetched && fetched.uids ? fetched.uids : [];
        console.log(`Found ${emails.length} emails`);

        if (emails.length === 0) {
            await recordLastSyncResult({
                at: syncStartedAt,
                status: 'success',
                message: 'No new emails found',
                processed: 0,
                created: 0,
                duplicates: 0
            });
            await touchUserSettingsUpdatedAt(syncStartedAt);
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
        let ticketsDuplicate = 0;
        let ticketsUpdated = 0;
        let ticketsSkipped = 0;
        let ticketEmailsHandled = 0;

        const perEmailDebug = debug ? [] : null;

        // Log parsed email subjects for debugging
        try {
            const parsedSubjects = emails.map(e => e && e.subject ? e.subject : '(no subject)');
            console.log('DEBUGGING: Parsed email subjects:', parsedSubjects.slice(0, 20));
        } catch (slogErr) {
            console.log('Error logging parsed subjects:', slogErr.message);
        }

        for (const email of emails) {
            try {
                const emailSubject = email && email.subject ? String(email.subject) : '';
                const emailFrom = email && email.from ? String(email.from) : '';

                // If the subject contains a ticket number, prefer appending to the existing ticket
                // instead of creating a duplicate ticket for replies/forwards.
                const ticketNumberInSubject = extractTicketNumberFromSubject(emailSubject);

                // IMPORTANT: Gmail often delivers a copy of your own outbound responses back into INBOX
                // (especially if you BCC yourself). Those should never create new tickets.
                // If we can see a ticket token in the subject and the sender is our own mailbox, skip it.
                const settingsMailbox = settings && settings.gmailAddress ? String(settings.gmailAddress).toLowerCase() : null;
                const fromLower = emailFrom.toLowerCase();
                if (ticketNumberInSubject && settingsMailbox && fromLower.includes(settingsMailbox)) {
                    ticketsSkipped++;
                    ticketEmailsHandled += 1;
                    if (perEmailDebug) {
                        perEmailDebug.push({
                            subject: emailSubject,
                            from: emailFrom,
                            ticketNumberInSubject,
                            action: 'skipped_outbound_copy'
                        });
                    }
                    continue;
                }

                if (ticketNumberInSubject) {
                    const existing = await findExistingTicketByNumber(ticketNumberInSubject);
                    if (existing && existing.id) {
                        const attached = await attachInboundEmailToTicket({
                            ticketId: existing.id,
                            email
                        });

                        // Regardless of whether we could log the conversation,
                        // do NOT create a new ticket when we can positively match an existing ticket number.
                        // This prevents duplicates from reply threads.
                        ticketsUpdated++;
                        ticketEmailsHandled += 1;

                        if (attached.ok) {
                            console.log(`Appended inbound email to existing ticket ${ticketNumberInSubject} (id=${existing.id})`);
                        } else {
                            console.warn(`Matched ticket ${ticketNumberInSubject} but could not log conversation (${attached.reason || 'unknown'}). Skipping new ticket to prevent duplicates.`);
                        }

                        if (perEmailDebug) {
                            perEmailDebug.push({
                                subject: emailSubject,
                                from: emailFrom,
                                ticketNumberInSubject,
                                matchedTicketId: existing.id,
                                attachOk: attached.ok === true,
                                attachReason: attached.ok ? null : attached.reason,
                                action: attached.ok ? 'appended_to_existing' : 'matched_existing_no_log'
                            });
                        }

                        continue;
                    }
                }

                // Check if this is a support ticket
                if (isTicketEmail(email)) {
                    console.log('Creating ticket for email:', email.subject);
                    ticketEmailsHandled += 1;
                    
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

                    try {
                        const savedTicket = await saveTicket(ticket);
                        if (savedTicket) {
                            ticketsCreated++;
                            console.log(`Ticket created successfully for: ${email.subject}`);

                            if (perEmailDebug) {
                                perEmailDebug.push({
                                    subject: emailSubject,
                                    from: emailFrom,
                                    ticketNumberInSubject,
                                    action: 'created_ticket',
                                    createdTicketId: savedTicket.id || null,
                                    createdTicketNumber: savedTicket.ticket_number || null
                                });
                            }
                        } else {
                            console.error('Failed to save ticket:', ticket);

                            if (perEmailDebug) {
                                perEmailDebug.push({
                                    subject: emailSubject,
                                    from: emailFrom,
                                    ticketNumberInSubject,
                                    action: 'failed_to_save'
                                });
                            }
                        }
                    } catch (saveError) {
                        if (isDuplicateTicketError(saveError)) {
                            ticketsDuplicate++;
                            console.log(`Duplicate ticket detected (already ingested): ${email.subject}`);

                            if (perEmailDebug) {
                                perEmailDebug.push({
                                    subject: emailSubject,
                                    from: emailFrom,
                                    ticketNumberInSubject,
                                    action: 'duplicate_message_id'
                                });
                            }
                        } else if (isMissingTicketsTableError(saveError)) {
                            console.error('Tickets table missing while saving ticket:', saveError.message);

                            if (perEmailDebug) {
                                perEmailDebug.push({
                                    subject: emailSubject,
                                    from: emailFrom,
                                    ticketNumberInSubject,
                                    action: 'tickets_table_missing'
                                });
                            }
                        } else {
                            console.error('Error saving ticket:', saveError.message, ticket);

                            if (perEmailDebug) {
                                perEmailDebug.push({
                                    subject: emailSubject,
                                    from: emailFrom,
                                    ticketNumberInSubject,
                                    action: 'save_error',
                                    error: saveError && saveError.message ? saveError.message : String(saveError)
                                });
                            }
                        }
                    }
                } else {
                    console.log('Email not identified as ticket:', email.subject);

                    if (perEmailDebug) {
                        perEmailDebug.push({
                            subject: emailSubject,
                            from: emailFrom,
                            ticketNumberInSubject,
                            action: 'not_a_ticket'
                        });
                    }
                }
            } catch (ticketError) {
                console.error('Error creating ticket for email:', email.subject, ticketError);
                // Continue processing other emails

                if (perEmailDebug) {
                    perEmailDebug.push({
                        subject: email && email.subject ? String(email.subject) : null,
                        from: email && email.from ? String(email.from) : null,
                        action: 'exception',
                        error: ticketError && ticketError.message ? ticketError.message : String(ticketError)
                    });
                }
            }
        }

        // Mark messages as seen if we handled any ticket emails.
        // This prevents endlessly reprocessing emails when inserts fail due to duplicates.
        if (fetchedUids && fetchedUids.length > 0 && (ticketsCreated > 0 || ticketsDuplicate > 0 || ticketsUpdated > 0 || ticketsSkipped > 0)) {
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

        // Record last sync timestamp (best-effort)
        await recordLastSyncResult({
            at: syncStartedAt,
            status: 'success',
            message: ticketsUpdated > 0
                ? `Email sync completed successfully (appended ${ticketsUpdated} replies)`
                : 'Email sync completed successfully',
            processed: emails.length,
            created: ticketsCreated,
            duplicates: ticketsDuplicate
        });
        await touchUserSettingsUpdatedAt(syncStartedAt);

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
                duplicates: ticketsDuplicate,
                appended: ticketsUpdated,
                skipped: ticketsSkipped,
                details: emails.map(email => ({
                    subject: email && email.subject ? email.subject : null,
                    from: email && email.from ? email.from : null,
                    isTicket: !!email && isTicketEmail(email)
                })),
                ...(perEmailDebug ? { debugEmails: perEmailDebug } : {}),
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

        await recordLastSyncResult({
            at: syncStartedAt,
            status: 'fail',
            message: error && error.message ? error.message : String(error)
        });
        await touchUserSettingsUpdatedAt(syncStartedAt);
        
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