# Backend Project

This is the backend service for the application.

## Project Structure

- `src/config/` - Configuration files
- `src/controller/` - Controllers for handling requests
- `src/middleware/` - Middleware functions
- `src/model/` - Database models
- `src/routes/` - API route definitions
- `src/utils/` - Utility functions

## Getting Started

### Prerequisites
- Node.js (v14 or higher recommended)
- npm or yarn

### Installation

```bash
npm install
```

### Environment Setup

Run the setup script to create your `.env` file:

```bash
npm run setup
```

This will:
- Create a `.env` file based on `env.example`
- Generate a secure JWT secret automatically
- Provide helpful links for setting up your credentials

### Running the Server

```bash
node src/index.js
```

Or, if using Docker:

```bash
docker compose up
```

## Environment Variables

This application uses environment variables for all sensitive configuration. Create a `.env` file in the root directory based on the `env.example` file.

### Required Environment Variables

- `JWT_SECRET` - Secret key for JWT token signing
- `MONGODB_URI` - MongoDB connection string
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `EMAIL_USER` - Gmail address for sending emails
- `EMAIL_PASS` - Gmail app password (not regular password)
- `TWILIO_ACCOUNT_SID` - Twilio account SID
- `TWILIO_AUTH_TOKEN` - Twilio auth token
- `TWILIO_PHONE_NUMBER` - Twilio phone number
- `APP_HASH` - App hash for SMS verification

### Security Notes

- Never commit the `.env` file to version control
- Use strong, unique passwords for all services
- Regularly rotate your API keys and secrets
- Use app-specific passwords for Gmail (not your regular password)
- Consider using a secrets management service in production

## License

MIT 