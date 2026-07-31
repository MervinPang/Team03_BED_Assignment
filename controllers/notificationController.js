// Notification Controller - Handles HTTP requests for the signed in account's
// inbox of new orders and tenancy offers
const notificationModel = require("../models/notificationModel");

/*
 * The inbox of whoever is signed in.
 *
 * The recipient always comes from the token and is never read from the query
 * string, so there is no request that can ask for another account's inbox.
 */
async function getMyNotifications(req, res) {
    try {
        const notifications = await notificationModel.getNotifications(
            Number(req.user.id),
            { unreadOnly: req.unreadOnly }
        );

        return res.status(200).json({
            notificationCount: notifications.length,
            unreadCount: notifications.filter(item => !item.IsRead).length,
            notifications,
        });
    } catch (error) {
        console.error("Controller error (getMyNotifications):", error);

        return res.status(500).json({
            error: "Unable to retrieve your notifications",
        });
    }
}

// The unread total on its own, for the badge on the dashboard
async function getMyUnreadCount(req, res) {
    try {
        const unreadCount = await notificationModel.getUnreadCount(
            Number(req.user.id)
        );

        return res.status(200).json({ unreadCount });
    } catch (error) {
        console.error("Controller error (getMyUnreadCount):", error);

        return res.status(500).json({
            error: "Unable to retrieve your unread notifications",
        });
    }
}

/*
 * Mark one notification read. A notification belonging to somebody else matches
 * nothing, so it is reported as not found rather than as forbidden and the
 * request learns nothing about another account's inbox.
 */
async function markNotificationRead(req, res) {
    try {
        const notificationId = await notificationModel.markAsRead(
            Number(req.params.notificationId),
            Number(req.user.id)
        );

        if (notificationId === null) {
            return res.status(404).json({
                error: "Notification not found, or it was already read",
            });
        }

        return res.status(200).json({
            message: "Notification marked as read",
            notificationId,
        });
    } catch (error) {
        console.error("Controller error (markNotificationRead):", error);

        return res.status(500).json({
            error: "Unable to mark the notification as read",
        });
    }
}

async function markAllNotificationsRead(req, res) {
    try {
        const updated = await notificationModel.markAllAsRead(
            Number(req.user.id)
        );

        return res.status(200).json({
            message:
                updated === 1
                    ? "1 notification marked as read"
                    : `${updated} notifications marked as read`,
            updated,
        });
    } catch (error) {
        console.error("Controller error (markAllNotificationsRead):", error);

        return res.status(500).json({
            error: "Unable to mark your notifications as read",
        });
    }
}

module.exports = {
    getMyNotifications,
    getMyUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
};
