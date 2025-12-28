# Twilio OTP Testing Guide

This guide will help you test the Twilio OTP functionality in your application.

## Prerequisites

1. **Twilio Account**: You need a Twilio account with:
   - Account SID
   - Auth Token
   - A verified phone number (or a purchased Twilio phone number)

2. **Environment Variables**: Set up your `.env` file with:
   ```env
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   APP_HASH=your_app_hash (optional)
   ```

## Testing Methods

### Method 1: Using the Test Script (Recommended)

The easiest way to test Twilio OTP is using the provided test script:

```bash
# Basic usage
node src/utils/testTwilioOTP.js +919876543210

# Or using environment variable
TEST_PHONE=+919876543210 node src/utils/testTwilioOTP.js
```

**What it does:**
- ✅ Validates environment variables
- ✅ Generates a test OTP
- ✅ Sends SMS via Twilio
- ✅ Shows detailed response information
- ✅ Provides troubleshooting tips

### Method 2: Using the Test API Endpoint

You can test via HTTP request:

```bash
# Using curl
curl -X POST http://localhost:2001/api/auth/test-twilio-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile": "+919876543210"}'

# With custom message
curl -X POST http://localhost:2001/api/auth/test-twilio-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile": "+919876543210", "message": "Your test OTP is: 123456"}'
```

**Note:** This endpoint is only available in development mode.

### Method 3: Using the Production OTP Endpoint

Test the actual OTP flow:

```bash
# Request OTP
curl -X POST http://localhost:2001/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile": "+919876543210"}'

# Response will include OTP sent confirmation
# Check your phone for the OTP code
```

### Method 4: Using the Simple Test Script

The original simple test script is still available:

```bash
node src/utils/testSMS.js
```

**Note:** You'll need to edit `testSMS.js` to change the phone number.

## Phone Number Format

**Important:** Phone numbers must be in E.164 format:
- ✅ Correct: `+919876543210` (India)
- ✅ Correct: `+1234567890` (US)
- ❌ Wrong: `9876543210` (missing country code)
- ❌ Wrong: `919876543210` (missing + prefix)

## Common Issues & Solutions

### Issue: "Twilio credentials not found"
**Solution:** 
- Create a `.env` file in the backend root directory
- Add your Twilio credentials from `env.example`

### Issue: Error Code 21211 - Invalid phone number
**Solution:**
- Ensure phone number includes country code with `+` prefix
- Format: `+[country_code][phone_number]`

### Issue: Error Code 21608 - Unverified phone number
**Solution:**
- If using Twilio trial account, verify the recipient phone number in Twilio Console
- Or upgrade to a paid account

### Issue: Error Code 20003 - Invalid credentials
**Solution:**
- Double-check your `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- Ensure there are no extra spaces in `.env` file

### Issue: Error Code 21212 - Invalid "from" number
**Solution:**
- Verify your `TWILIO_PHONE_NUMBER` is correct
- Ensure it's a valid Twilio phone number you own

## Testing Checklist

- [ ] Environment variables are set correctly
- [ ] Twilio account is active
- [ ] Phone number format is correct (E.164)
- [ ] Test script runs without errors
- [ ] SMS is received on test phone
- [ ] OTP code matches what was sent
- [ ] Full OTP flow works (request → verify)

## Integration Testing

To test the complete OTP flow:

1. **Request OTP:**
   ```bash
   POST /api/auth/request-otp
   Body: { "mobile": "+919876543210" }
   ```

2. **Check phone for OTP code**

3. **Verify OTP:**
   ```bash
   POST /api/auth/verify-email
   Body: { 
     "identifier": "+919876543210",
     "code": "123456"
   }
   ```

## Debugging

Enable detailed logging by checking:
- Server console for SMS send confirmations
- Twilio Console → Logs → Messaging for delivery status
- Check message status in Twilio dashboard

## Security Notes

⚠️ **Important:**
- Never commit `.env` file to version control
- Remove hardcoded credentials (already fixed in `sendSMS.js`)
- Test endpoint is disabled in production
- Use environment variables for all sensitive data

## Additional Resources

- [Twilio API Documentation](https://www.twilio.com/docs/sms)
- [Twilio Phone Number Format](https://www.twilio.com/docs/glossary/what-e164)
- [Twilio Error Codes](https://www.twilio.com/docs/api/errors)

