const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.js");
const {
  registerToken,
  getNotifications,
  deleteNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  createNotification,
} = require("../controller/notification.controller.js");

// Register push token (requires authentication)
router.post("/register-token", auth, registerToken);

// Get all notifications (requires authentication)
router.get("/", auth, getNotifications);

// Get unread count (requires authentication)
router.get("/unread-count", auth, getUnreadCount);

// Delete a notification (requires authentication)
router.delete("/:notificationId", auth, deleteNotification);

// Mark notification as read (requires authentication)
router.patch("/:notificationId/read", auth, markAsRead);

// Mark all notifications as read (requires authentication)
router.patch("/read-all", auth, markAllAsRead);

// Create notification (for internal use - you may want to add admin auth)
router.post("/create", auth, createNotification);

module.exports = router;
