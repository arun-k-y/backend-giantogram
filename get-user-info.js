/**
 * Helper script to get user ID and token
 * 
 * HOW TO GET USER ID AND TOKEN:
 * 
 * Method 1 (Easiest): Use this script
 *   node get-user-info.js your-email@example.com yourpassword
 * 
 * Method 2: Login via API
 *   curl -X POST http://localhost:2001/api/auth/signin \
 *     -H "Content-Type: application/json" \
 *     -d '{"identifier":"your-email","password":"yourpassword"}'
 *   Response includes: token and user._id
 * 
 * Method 3: Check backend logs when you login in the app
 * 
 * Method 4: Query MongoDB - find user in 'users' collection, copy _id field
 * 
 * Usage: node get-user-info.js <email_or_username> <password>
 */

// Use built-in fetch (Node 18+) or provide instructions
let fetch;
if (typeof globalThis.fetch === 'function') {
  fetch = globalThis.fetch;
} else {
  console.error('Node.js 18+ required for built-in fetch, or install node-fetch:');
  console.error('  npm install node-fetch');
  console.error('\nAlternatively, use curl command shown below.');
  process.exit(1);
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:2001';
const identifier = process.argv[2];
const password = process.argv[3];

if (!identifier || !password) {
  console.error('Usage: node get-user-info.js <email_or_username> <password>');
  console.error('\nExample:');
  console.error('  node get-user-info.js user@example.com mypassword');
  console.error('  node get-user-info.js myusername mypassword');
  process.exit(1);
}

async function getUserInfo() {
  try {
    console.log('Logging in...');
    
    const response = await fetch(`${BASE_URL}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: identifier,
        password: password,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('\n❌ Login Failed');
      console.error('Status:', response.status);
      console.error('Error:', errorData.message || errorData.code || 'Unknown error');
      
      if (errorData.code === 'INVALID_CREDENTIALS') {
        console.error('\n💡 Make sure your email/username and password are correct.');
      }
      return;
    }

    const data = await response.json();

    if (data.token && data.user) {
      console.log('\n✅ Login Successful!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 USER INFORMATION:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('User ID:', data.user._id);
      console.log('Username:', data.user.username);
      console.log('Email:', data.user.email || 'N/A');
      console.log('Mobile:', data.user.mobile || 'N/A');
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔑 ACCESS TOKEN:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(data.token);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 TEST NOTIFICATION COMMAND:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`node test-notification.js ${data.user._id} ${data.token}`);
      console.log('\n');
    } else {
      console.error('\n❌ Login response missing token or user data');
      console.error('Response:', data);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('\n💡 Make sure:');
      console.error('   1. Backend is running (npm start in backend-g)');
      console.error('   2. BASE_URL is correct (default: http://localhost:2001)');
    }
  }
}

getUserInfo();
