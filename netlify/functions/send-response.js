const { createClient } = require('@supabase/supabase-js');

function isMissingRelation(error) {
    const msg = (error && error.message ? String(error.message) : '').toLowerCase();
    return msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache');
}

function getDatabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase credentials');
    }
    
    return createClient(supabaseUrl, supabaseKey);
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

        console.log(`Saving response for ticket ${ticketId} to ${to}`);

        // For now, just save the response as a comment instead of actually sending email
        // This allows the feature to work without email configuration
        const supabase = getDatabase();
        
        const { data: comment, error: commentError } = await supabase
            .from('ticket_comments')
            .insert({
                ticket_id: ticketId,
                comment_text: message,
                comment_type: 'outbound',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (commentError) {
            console.error('Error saving response:', commentError);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: commentError.message
                })
            };
        }

        // Update ticket's updated_at timestamp
        await supabase
            .from('tickets')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', ticketId);

        console.log('Response saved successfully as comment');

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Response saved successfully',
                comment: comment,
                note: 'Email sending is disabled. Response saved as internal comment.'
            })
        };
    } catch (error) {
        console.error('Error in send-response:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: error.message || 'Internal server error'
            })
        };
    }
};
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