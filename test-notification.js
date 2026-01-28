/**
 * Test script to create a notification
 * 
 * HOW TO GET USER ID AND TOKEN:
 * 1. Run: node get-user-info.js your-email@example.com yourpassword
 *    This will show both User ID and Token
 * 
 * 2. Or login via API and get from response:
 *    curl -X POST http://localhost:2001/api/auth/signin \
 *      -H "Content-Type: application/json" \
 *      -d '{"identifier":"your-email","password":"yourpassword"}'
 * 
 * Usage: node test-notification.js <userId> <accessToken>
 * Example: node test-notification.js 507f1f77bcf86cd799439011 eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */

// Use built-in fetch (Node 18+) or require node-fetch for older versions
let fetch;
try {
  fetch = globalThis.fetch || require('node-fetch');
} catch (e) {
  console.error('Please install node-fetch: npm install node-fetch');
  process.exit(1);
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:2001';
const userId = process.argv[2];
const accessToken = process.argv[3];

if (!userId || !accessToken) {
  console.error('Usage: node test-notification.js <userId> <accessToken>');
  console.error('\nExample:');
  console.error('  node test-notification.js 507f1f77bcf86cd799439011 eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  process.exit(1);
}

async function createTestNotification() {
  try {
    const date = new Date();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    const notificationData = {
      userId: userId,
      avatar: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 50) + 1}`,
      message: `Test notification at ${hours}:${minutes}`,
      userType: 'Verified user',
    };

    console.log('Creating notification...');
    console.log('Data:', JSON.stringify(notificationData, null, 2));

    const response = await fetch(`${BASE_URL}/api/notifications/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(notificationData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('\n❌ Failed to create notification');
      console.error('Status:', response.status);
      console.error('Error:', errorData.message || 'Unknown error');
      return;
    }

    const data = await response.json();

    if (data.success) {
      console.log('\n✅ Notification created successfully!');
      console.log('Response:', JSON.stringify(data, null, 2));
      console.log('\n💡 Now check your app and pull to refresh the notifications list.');
    } else {
      console.error('\n❌ Notification creation failed');
      console.error('Response:', data.message || 'Unknown error');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('💡 Make sure the backend server is running on', BASE_URL);
    }
  }
}

createTestNotification();
