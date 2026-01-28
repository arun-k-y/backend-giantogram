const Notification = require("../model/notification.model.js");
const User = require("../model/user.model.js");
const { sendFirebaseNotification } = require("../utils/sendFirebaseNotification.js");

/**
 * Register push token for a user
 */
const registerToken = async (req, res) => {
  try {
    const { pushToken, platform } = req.body;
    const userId = req.user._id;

    if (!pushToken || !platform) {
      return res.status(400).json({
        success: false,
        message: "pushToken and platform are required",
      });
    }

    if (!["ios", "android"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "platform must be 'ios' or 'android'",
      });
    }

    await User.findByIdAndUpdate(userId, {
      pushToken,
      pushTokenPlatform: platform,
      pushTokenUpdatedAt: new Date(),
    });

    res.json({
      success: true,
      message: "Push token registered successfully",
    });
  } catch (error) {
    console.error("Error registering push token:", error);
    res.status(500).json({
      success: false,
      message: "Failed to register push token",
    });
  }
};

/**
 * Get all notifications for a user with pagination
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    // Format timestamps to HH:MM format
    const formattedNotifications = notifications.map((notif) => {
      const date = new Date(notif.createdAt);
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return {
        ...notif,
        id: notif._id.toString(),
        timestamp: `${hours}:${minutes}`,
        createdAt: notif.createdAt.toISOString(),
      };
    });

    const total = await Notification.countDocuments({ userId });
    const unreadCount = await Notification.countDocuments({
      userId,
      read: false,
    });

    res.json({
      success: true,
      notifications: formattedNotifications,
      total,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
};

/**
 * Delete a notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
    });
  }
};

/**
 * Mark a notification as read
 */
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
    });
  }
};

/**
 * Mark all notifications as read
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { userId, read: false },
      { read: true }
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark all notifications as read",
    });
  }
};

/**
 * Get unread notification count
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const count = await Notification.countDocuments({
      userId,
      read: false,
    });

    res.json({
      success: true,
      count,
    });
  } catch (error) {
    console.error("Error getting unread count:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get unread count",
    });
  }
};

/**
 * Create a new notification (for internal use or admin)
 */
const createNotification = async (req, res) => {
  try {
    const { userId, avatar, message, userType, groupName } = req.body;

    if (!userId || !avatar || !message) {
      return res.status(400).json({
        success: false,
        message: "userId, avatar, and message are required",
      });
    }

    const date = new Date();
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const timestamp = `${hours}:${minutes}`;

    const notification = new Notification({
      userId,
      avatar,
      message,
      timestamp,
      userType: userType || null,
      groupName: groupName || null,
      read: false,
    });

    await notification.save();

    // Send push notification if user has a push token
    // Note: Push notification failure should not fail the request
    try {
      console.log(`🔔 Attempting to send push notification for user ${userId}`);
      const sent = await sendFirebaseNotification(
        userId,
        "New Notification",
        message,
        {
          notificationId: notification._id.toString(),
          avatar,
          userType,
          groupName,
        }
      );

      if (sent) {
        console.log(`✅ Notification sent via Firebase for user ${userId}`);
      } else {
        console.warn(`⚠️ Failed to send push notification for user ${userId}`);
      }
    } catch (error) {
      const errorMessage = error?.message || error;
      console.error("❌ Error in push notification flow:", errorMessage);
      if (error?.stack) {
        console.error("Error stack:", error.stack);
      }
      // Don't fail the request if push notification fails
    }

    res.status(201).json({
      success: true,
      message: "Notification created successfully",
      notification: {
        ...notification.toObject(),
        id: notification._id.toString(),
      },
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create notification",
    });
  }
};

module.exports = {
  registerToken,
  getNotifications,
  deleteNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  createNotification,
};
