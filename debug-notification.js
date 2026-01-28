/**
 * Debug script to test notification flow and check what's happening
 * 
 * Usage: node debug-notification.js <userId> <accessToken>
 */

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
  console.error('Usage: node debug-notification.js <userId> <accessToken>');
  process.exit(1);
}

async function debugNotification() {
  try {
    console.log('🔍 Debugging notification flow...\n');
    
    // Step 1: Check user's push token
    console.log('Step 1: Checking user push token...');
    try {
      const userResponse = await fetch(`${BASE_URL}/api/auth/protected`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!userResponse.ok) {
        const errorData = await userResponse.json().catch(() => ({}));
        console.error('❌ Failed to get user info');
        console.error('Status:', userResponse.status);
        console.error('Error:', errorData.message || 'Unknown error');
        return;
      }

      const userData = await userResponse.json();
      const pushToken = userData.user?.pushToken;
      
      if (!pushToken) {
        console.error('❌ User has no push token registered!');
        console.log('💡 Make sure the app is running and logged in to register push token.');
        return;
      }
      
      console.log(`✅ Push token found: ${pushToken.substring(0, 40)}...`);
      
      // Check token type
      if (pushToken.includes('ExponentPushToken')) {
        console.log('📱 Token type: Expo Push Token (legacy - should use native FCM)');
      } else {
        console.log('🔥 Token type: Native FCM Token (will use Firebase Admin SDK)');
      }
    } catch (error) {
      console.error('❌ Error checking user push token:', error.message);
      return;
    }
    
    // Step 2: Create notification
    console.log('\nStep 2: Creating notification...');
    try {
      const notificationData = {
        userId: userId,
        avatar: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 50) + 1}`,
        message: `Debug test notification at ${new Date().toLocaleTimeString()}`,
        userType: 'Verified user',
      };

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
        console.error('❌ Failed to create notification');
        console.error('Status:', response.status);
        console.error('Error:', errorData.message || 'Unknown error');
        return;
      }

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Notification created successfully!');
        console.log('📋 Notification ID:', data.notification?.id || data.notification?._id);
        console.log('\n💡 Check backend logs for:');
        console.log('   - "🔔 Attempting to send push notification"');
        console.log('   - "✅ Notification sent via Firebase"');
        console.log('   - Any error messages');
        console.log('\n📱 Check your app:');
        console.log('   - Make sure app is open or in background');
        console.log('   - Check notification tray');
        console.log('   - Pull to refresh notifications list');
      } else {
        console.error('❌ Notification creation failed');
        console.error('Response:', data.message || 'Unknown error');
      }
    } catch (error) {
      console.error('❌ Error creating notification:', error.message);
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

debugNotification();
