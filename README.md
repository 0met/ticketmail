# TicketMail - Gmail Ticket Management System

A modern web application that converts Gmail emails into a ticket management system using Netlify Functions and NeonDB.

## Features

- **Gmail Integration**: Connect your Gmail account using IMAP
- **Automatic Ticket Creation**: Emails are automatically converted to tickets
- **Smart Categorization**: Automatic status assignment based on email content
- **Real-time Dashboard**: View ticket statistics and manage tickets
- **Secure Storage**: Encrypted password storage with NeonDB
- **Netlify Hosting**: Serverless deployment with Netlify Functions

## Setup Instructions

### 1. Prerequisites

- Gmail account with App Password enabled
- Netlify account
- NeonDB account

### 2. Gmail Configuration

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
   - Use this password in the app settings

### 3. NeonDB Setup

1. Create a NeonDB project at [neon.tech](https://neon.tech)
2. Get your connection string from the dashboard
3. The database tables will be created automatically on first run

### 4. Netlify Deployment

1. Fork this repository
2. Connect to Netlify and deploy
3. Set environment variables in Netlify dashboard:
   ```
   DATABASE_URL=your_neon_connection_string
   ENCRYPTION_KEY=your_secure_encryption_key
   ```

### 5. Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/0met/ticketmail.git
   cd ticketmail
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

4. Update `.env` with your credentials

5. Start development server:
   ```bash
   npm run dev
   ```

## Project Structure

```
ticketmail/
├── index.html              # Main application UI
├── package.json             # Dependencies and scripts
├── netlify.toml            # Netlify configuration
├── .env.example            # Environment variables template
├── netlify/
│   └── functions/
│       ├── lib/
│       │   └── database.js  # Database helper functions
│       ├── settings-update.js  # Save user settings
│       ├── tickets-sync.js     # IMAP email sync
│       └── tickets-load.js     # Load tickets from DB
└── README.md
```

## API Endpoints

### Settings Management
- `POST /.netlify/functions/settings-update` - Save Gmail settings

### Ticket Management
- `GET /.netlify/functions/tickets-load` - Load tickets from database
- `POST /.netlify/functions/tickets-sync` - Sync emails from Gmail

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | NeonDB connection string | Yes |
| `ENCRYPTION_KEY` | Key for encrypting sensitive data | Yes |
| `NODE_ENV` | Environment (development/production) | No |

## Security Features

- Gmail App Passwords (no main password storage)
- Encrypted password storage using AES encryption
- CORS protection for API endpoints
- Input validation and sanitization
- Secure database connections

## Usage

1. **Configure Settings**: Enter your Gmail address and app password
2. **Test Connection**: Verify Gmail connectivity
3. **Sync Emails**: Click "Refresh Emails" to fetch and process emails
4. **Manage Tickets**: View and manage tickets in the dashboard

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Ensure 2FA is enabled on Gmail
   - Use App Password, not your main Gmail password
   - Check email address spelling

2. **Database Connections**
   - Verify DATABASE_URL is correct
   - Check NeonDB project is active
   - Ensure network connectivity

3. **Netlify Functions**
   - Check function logs in Netlify dashboard
   - Verify environment variables are set
   - Ensure all dependencies are installed

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support, please open an issue on GitHub or contact the development team.