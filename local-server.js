const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});
app.use(express.static(path.join(__dirname))); // Serve static files from root

// Helper to adapt Express request to Netlify Function event
const adaptRequest = (req) => {
    return {
        body: JSON.stringify(req.body),
        queryStringParameters: req.query,
        headers: req.headers,
        httpMethod: req.method
    };
};

// Helper to handle Netlify Function response in Express
const handleResponse = (res, netlifyResponse) => {
    const statusCode = netlifyResponse.statusCode || 200;
    const headers = netlifyResponse.headers || {};
    const body = netlifyResponse.body || '';

    Object.keys(headers).forEach(key => {
        res.setHeader(key, headers[key]);
    });

    res.status(statusCode).send(body);
};

// Route handler wrapper
const route = (functionPath) => async (req, res) => {
    try {
        const handler = require(functionPath).handler;
        const event = adaptRequest(req);
        const context = {}; // Mock context if needed

        const response = await handler(event, context);
        handleResponse(res, response);
    } catch (error) {
        console.error(`Error in ${functionPath}:`, error);
        res.status(500).json({ error: error.message });
    }
};

// API Routes Mapping
// We need to map every Netlify function to an Express route
// Example: app.all('/.netlify/functions/auth-login', route('./netlify/functions/auth-login'));

// Auto-load routes from netlify/functions
const functionsDir = path.join(__dirname, 'netlify', 'functions');
if (fs.existsSync(functionsDir)) {
    fs.readdirSync(functionsDir).forEach(file => {
        if (file.endsWith('.js')) {
            const routeName = file.replace('.js', '');
            const routePath = `/.netlify/functions/${routeName}`;
            console.log(`Mapping route: ${routePath}`);
            app.all(routePath, route(path.join(functionsDir, file)));
        }
    });
}

// Start server
app.listen(PORT, () => {
    console.log(`
🚀 Local TicketMail Server running at http://localhost:${PORT}
📂 Serving static files from ${__dirname}
🔌 API endpoints mapped to /.netlify/functions/*
`);
});
