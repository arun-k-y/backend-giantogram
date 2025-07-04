#!/usr/bin/env node

/**
 * Environment Setup Script
 * Helps users create a .env file with proper configuration
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🔧 Setting up environment variables...\n');

// Check if .env already exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  console.log('⚠️  .env file already exists. Backing up to .env.backup');
  fs.copyFileSync(envPath, envPath + '.backup');
}

// Generate a secure JWT secret
const jwtSecret = crypto.randomBytes(64).toString('hex');

// Read the example file
const examplePath = path.join(__dirname, '..', 'env.example');
let envContent = '';

if (fs.existsSync(examplePath)) {
  envContent = fs.readFileSync(examplePath, 'utf8');
} else {
  // Fallback content if example file doesn't exist
  envContent = `# Server Configuration
PORT=2001
NODE_ENV=development

# JWT Configuration
JWT_SECRET=${jwtSecret}

# Database Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Email Configuration (Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# App Configuration
APP_HASH=your_app_hash_for_sms

# CORS Configuration
CORS_ORIGIN=*
`;
}

// Replace the JWT_SECRET with a generated one
envContent = envContent.replace(/JWT_SECRET=.*/, `JWT_SECRET=${jwtSecret}`);

// Write the .env file
fs.writeFileSync(envPath, envContent);

console.log('✅ .env file created successfully!');
console.log('🔑 A secure JWT secret has been generated automatically');
console.log('\n📝 Next steps:');
console.log('1. Edit the .env file with your actual credentials');
console.log('2. Never commit the .env file to version control');
console.log('3. Keep your credentials secure and rotate them regularly');
console.log('\n⚠️  Important security notes:');
console.log('- Use app-specific passwords for Gmail (not your regular password)');
console.log('- Use strong, unique passwords for all services');
console.log('- Consider using a secrets management service in production');
console.log('- Regularly rotate your API keys and secrets');

console.log('\n🔗 Useful links:');
console.log('- Gmail App Passwords: https://support.google.com/accounts/answer/185833');
console.log('- Twilio Console: https://console.twilio.com/');
console.log('- Cloudinary Dashboard: https://cloudinary.com/console');
console.log('- MongoDB Atlas: https://cloud.mongodb.com/'); 