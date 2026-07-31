// Notification Model - Handles database operations for the inbox that tells a
// vendor about new orders and about tenancy offers waiting on their signature
const sql = require("mssql");
const dbConfig = require("../dbConfig");

/*
 * sql.connect() returns the connection pool shared by the whole application, so
 * closing it after a query would close it for every request that is still
 * running. The pool is left open here and app.js closes it on shutdown.
 */

/*
 * A notification is a short line of text, but the inbox has to show what the
 * line is about as it stands now rather than as it stood when it was written.
 * An order that has since been collected and an offer that has since been
 * signed both have to read correctly, so the subject of each notification is
 * joined back in and never copied into the message.
 */
const NOTIFICATION_COLUMNS = `
    n.NotificationID,
    n.RecipientUserID,
    n.NotificationType,
    n.Title,
    n.Message,
    n.OrderID,
    n.OfferID,
    n.IsRead,
    n.CreatedAt,
    n.ReadAt,
    co.OrderStatus,
    co.TotalAmount,
    co.OrderDateTime,
    ISNULL(customer.Username, co.GuestName) AS CustomerName,
    ao.OfferStatus,
    ao.ProposedEndDate,
    ao.ProposedRentalPrice,
    ao.OfferNote,
    ra.AgreementID,
    ra.EndDate AS CurrentEndDate,
    ra.RentalPrice AS CurrentRentalPrice,
    fs.StallName,
    hc.HCName,
    o.OperatorName
`;

const NOTIFICATION_JOINS = `
    FROM Notification n
    LEFT JOIN CustomerOrder co
        ON n.OrderID = co.OrderID
    LEFT JOIN UserAccount customer
        ON co.UserID = customer.UserID
    LEFT JOIN AgreementOffer ao
        ON n.OfferID = ao.OfferID
    LEFT JOIN RentalAgreement ra
        ON ao.AgreementID = ra.AgreementID
    LEFT JOIN FoodStall fs
        ON ra.StallID = fs.StallID
    LEFT JOIN HawkerCentre hc
        ON fs.HawkerCentreID = hc.HawkerCentreID
    LEFT JOIN Operator o
        ON hc.OperatorID = o.OperatorID
`;

/*
 * The inbox of one account, newest first. Only the recipient's own rows are
 * read, so the account on the token decides the contents of the list and no
 * request can ask for somebody else's inbox.
 */
async function getNotifications(recipientUserId, { unreadOnly = false } = {}) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("RecipientUserID", sql.Int, recipientUserId);
        request.input("UnreadOnly", sql.Bit, unreadOnly ? 1 : 0);

        const result = await request.query(`
            SELECT ${NOTIFICATION_COLUMNS}
            ${NOTIFICATION_JOINS}
            WHERE n.RecipientUserID = @RecipientUserID
              AND (@UnreadOnly = 0 OR n.IsRead = 0)
            ORDER BY n.CreatedAt DESC, n.NotificationID DESC;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getNotifications):", error);
        throw error;
    }
}

// The unread total behind the badge on the dashboard
async function getUnreadCount(recipientUserId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("RecipientUserID", sql.Int, recipientUserId);

        const result = await request.query(`
            SELECT COUNT(*) AS UnreadCount
            FROM Notification
            WHERE RecipientUserID = @RecipientUserID
              AND IsRead = 0;
        `);

        return result.recordset[0].UnreadCount;
    } catch (error) {
        console.error("Database error (getUnreadCount):", error);
        throw error;
    }
}

/*
 * Write a notification. Called when an operator puts terms to a vendor and when
 * the vendor answers. New orders are not written here: they are raised by the
 * TR_OrderItem_NotifyVendor trigger, because an order reaches a stall through
 * its items and the order row is written before those items exist.
 */
async function createNotification({
    recipientUserId,
    notificationType,
    title,
    message,
    orderId = null,
    offerId = null,
}) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("RecipientUserID", sql.Int, recipientUserId);
        request.input("NotificationType", sql.VarChar(30), notificationType);
        request.input("Title", sql.VarChar(120), title);
        request.input("Message", sql.VarChar(500), message);
        request.input("OrderID", sql.Int, orderId);
        request.input("OfferID", sql.Int, offerId);

        const result = await request.query(`
            INSERT INTO Notification
                (RecipientUserID, NotificationType, Title, Message, OrderID, OfferID)
            OUTPUT INSERTED.NotificationID
            VALUES
                (@RecipientUserID, @NotificationType, @Title, @Message, @OrderID, @OfferID);
        `);

        return result.recordset[0].NotificationID;
    } catch (error) {
        console.error("Database error (createNotification):", error);
        throw error;
    }
}

/*
 * Mark one notification read. The recipient is part of the WHERE clause rather
 * than checked beforehand, so an ID belonging to another account simply matches
 * nothing and the caller is told it was not found.
 */
async function markAsRead(notificationId, recipientUserId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("NotificationID", sql.Int, notificationId);
        request.input("RecipientUserID", sql.Int, recipientUserId);

        const result = await request.query(`
            UPDATE Notification
            SET IsRead = 1,
                ReadAt = GETDATE()
            OUTPUT INSERTED.NotificationID
            WHERE NotificationID = @NotificationID
              AND RecipientUserID = @RecipientUserID
              AND IsRead = 0;
        `);

        return result.recordset[0] ? result.recordset[0].NotificationID : null;
    } catch (error) {
        console.error("Database error (markAsRead):", error);
        throw error;
    }
}

// Clear the whole inbox badge in one step
async function markAllAsRead(recipientUserId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("RecipientUserID", sql.Int, recipientUserId);

        const result = await request.query(`
            UPDATE Notification
            SET IsRead = 1,
                ReadAt = GETDATE()
            WHERE RecipientUserID = @RecipientUserID
              AND IsRead = 0;
        `);

        return result.rowsAffected[0];
    } catch (error) {
        console.error("Database error (markAllAsRead):", error);
        throw error;
    }
}

module.exports = {
    getNotifications,
    getUnreadCount,
    createNotification,
    markAsRead,
    markAllAsRead,
};
