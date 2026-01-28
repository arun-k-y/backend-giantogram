const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const User = require("../model/user.model.js");

/**
 * Firebase Push Notification Setup:
 * 
 * STEP 1: Complete Firebase Console Registration
 * - Android package name: com.arun100.myapp
 * - Download google-services.json to frontend-g/
 * 
 * STEP 2: Get Firebase Service Account Key
 * - Firebase Console > Project Settings > Service Accounts > Generate new private key
 * - Save as firebase-service-account.json in backend-g/
 * - Add to .env: FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
 * 
 * STEP 3: Build app (required - Expo Go won't work)
 * - npx expo run:android
 * 
 * STEP 4: Test
 * - App uses native FCM tokens (via getDevicePushTokenAsync)
 * - Backend sends notifications via Firebase Admin SDK
 */

let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) {
    return;
  }

  try {
    // Option 1: Use service account key file
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    // Option 2: Use service account file path
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      // Resolve path relative to project root (backend-g/)
      const serviceAccountPath = path.isAbsolute(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
        ? process.env.FIREBASE_SERVICE_ACCOUNT_PATH
        : path.resolve(__dirname, "../../", process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      
      // Read and parse JSON file
      const serviceAccountJson = fs.readFileSync(serviceAccountPath, "utf8");
      const serviceAccount = JSON.parse(serviceAccountJson);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      console.warn("⚠️ Firebase not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT_PATH");
      return;
    }

    firebaseInitialized = true;
    console.log("✅ Firebase Admin SDK initialized");
  } catch (error) {
    console.error("❌ Error initializing Firebase:", error);
  }
};

// Initialize on module load
initializeFirebase();

/**
 * Send push notification to a single user using Firebase Admin SDK
 * @param {string} userId - User ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body/message
 * @param {object} data - Additional data to send with notification
 * @returns {Promise<boolean>} - Success status
 */
const sendFirebaseNotification = async (userId, title, body, data = {}) => {
  try {
    // Get user's FCM token
    const user = await User.findById(userId);

    if (!user || !user.pushToken) {
      console.log(`No FCM token found for user ${userId}`);
      return false;
    }

    // Verify Firebase is initialized
    if (!firebaseInitialized) {
      console.error("Firebase not initialized");
      return false;
    }

    // Build notification message
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        ...Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, String(value)])
        ),
        userId: userId.toString(),
      },
      token: user.pushToken,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    // Send notification via Firebase Admin SDK
    const response = await admin.messaging().send(message);
    console.log("✅ Successfully sent Firebase message:", response);
    return true;
  } catch (error) {
    const errorMessage = error?.message || error;
    console.error("❌ Error sending Firebase notification:", errorMessage);
    
    // Provide helpful error context
    if (error?.code === 'messaging/invalid-argument' && 
        errorMessage?.includes('registration token')) {
      console.error("   Token format may be invalid. Ensure app is using native FCM tokens.");
    }
    return false;
  }
};

/**
 * Send push notification to multiple users using Firebase Admin SDK
 * @param {Array<string>} userIds - Array of user IDs
 * @param {string} title - Notification title
 * @param {string} body - Notification body/message
 * @param {object} data - Additional data to send with notification
 * @returns {Promise<number>} - Number of successful sends
 */
const sendFirebaseNotificationToMultiple = async (userIds, title, body, data = {}) => {
  try {
    // Find all users with push tokens
    const users = await User.find({
      _id: { $in: userIds },
      pushToken: { $ne: null },
    });

    if (users.length === 0) {
      console.log("No users with FCM tokens found");
      return 0;
    }

    // Extract valid push tokens
    const tokens = users.map((user) => user.pushToken).filter(Boolean);

    // Verify Firebase is initialized
    if (!firebaseInitialized) {
      console.error("Firebase not initialized");
      return 0;
    }

    // Build multicast message
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        ...Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, String(value)])
        ),
      },
      android: {
        priority: "high",
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
      tokens: tokens,
    };

    // Send notifications via Firebase Admin SDK multicast
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Sent to ${response.successCount} devices`);
    return response.successCount;
  } catch (error) {
    const errorMessage = error?.message || error;
    console.error("❌ Error sending to multiple users:", errorMessage);
    return 0;
  }
};

module.exports = {
  sendFirebaseNotification,
  sendFirebaseNotificationToMultiple,
  initializeFirebase,
};
