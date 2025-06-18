// testSMS.js
const sendSMS = require('./sendSMS');

(async () => {
  try {
    const res = await sendSMS('+919071528065', 'Hello ');
    console.log('Twilio response:', res.sid);
  } catch (err) {
    console.error('SMS test failed:', err.message);
  }
})();
