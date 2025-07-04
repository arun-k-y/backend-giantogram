// // Example SMS service implementation
// const sendSMS = async (mobile, message) => {
//   // Implement with your preferred SMS provider (Twilio, AWS SNS, etc.)
//   // Example with Twilio:
//   const client = require("twilio")(accountSid, authToken);
//   return client.messages.create({
//     body: message,
//     from: "+1234567890", // Your Twilio number
//     to: mobile,
//   });
//   console.log(`SMS to ${mobile}: ${message}`);
// };

// module.exports = sendSMS;

// smsService.js

const twilio = require("twilio");

// Validate required environment variables
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
  console.warn("⚠️  Twilio credentials not found in environment variables");
}

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN 
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER 

const client = twilio(accountSid, authToken);

/**
 * Send SMS using Twilio
 * @param {string} mobile - The recipient's mobile number (e.g., +919876543210)
 * @param {string} message - The message to send
 * @returns {Promise<object>} - The Twilio message response
 */
const sendSMS = async (mobile, message) => {
  try {
    const response = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: mobile,
    });

    console.log(`✅ SMS sent to ${mobile}: ${message}`);
    return response;
  } catch (error) {
    console.error(`❌ Failed to send SMS to ${mobile}:`, error.message);
    throw error;
  }
};

module.exports = sendSMS;
