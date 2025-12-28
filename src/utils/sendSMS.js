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
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !twilioPhoneNumber) {
  console.warn("⚠️  Twilio credentials not found in environment variables");
  console.warn("⚠️  Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in your .env file");
}

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Send SMS using Twilio
 * @param {string} mobile - The recipient's mobile number (e.g., +919876543210)
 * @param {string} message - The message to send
 * @returns {Promise<object>} - The Twilio message response
 */
const sendSMS = async (mobile, message) => {
  if (!client) {
    throw new Error("Twilio client not initialized. Please check your environment variables.");
  }

  if (!twilioPhoneNumber) {
    throw new Error("TWILIO_PHONE_NUMBER not set in environment variables.");
  }

  try {
    const response = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: mobile,
    });

    console.log(`✅ SMS sent successfully!`);
    console.log(`   To: ${mobile}`);
    console.log(`   From: ${twilioPhoneNumber}`);
    console.log(`   Message SID: ${response.sid}`);
    console.log(`   Status: ${response.status}`);
    return response;
  } catch (error) {
    console.error(`❌ Failed to send SMS to ${mobile}:`, error.message);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
    throw error;
  }
};

module.exports = sendSMS;
