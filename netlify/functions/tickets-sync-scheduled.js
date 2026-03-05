// Scheduled email sync (runs server-side on Netlify schedule)
// Note: Netlify scheduled functions can't be invoked via URL in production.

const { handler: ticketsSyncHandler } = require('./tickets-sync');

exports.handler = async (_event, context) => {
    // Reuse the existing sync logic with a minimal synthetic event.
    // The underlying handler reads settings from the database.
    const event = {
        httpMethod: 'POST',
        body: JSON.stringify({}),
        queryStringParameters: {}
    };

    return ticketsSyncHandler(event, context);
};
