const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Retrieve active orders for the authenticated customer
// Active orders include Pending, Preparing and Ready orders
async function getActiveOrderHistory(userId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("UserID", sql.Int, userId);

        const result = await request.query(`
            SELECT
                co.OrderID,
                co.OrderStatus,
                co.TotalAmount,
                co.OrderDateTime,
                co.UpdatedAt,
                fs.StallID,
                fs.StallName,
                fs.StallImage,
                p.PaymentMethod,
                p.PaymentStatus,
                SUM(oi.Quantity) AS TotalQuantity
            FROM CustomerOrder co
            JOIN OrderItem oi
                ON co.OrderID = oi.OrderID
            JOIN MenuItem mi
                ON oi.MenuItemID = mi.MenuItemID
            JOIN FoodStall fs
                ON mi.StallID = fs.StallID
            LEFT JOIN Payment p
                ON co.OrderID = p.OrderID
            WHERE
                co.UserID = @UserID
                AND co.OrderStatus IN (
                    'Pending',
                    'Preparing',
                    'Ready'
                )
            GROUP BY
                co.OrderID,
                co.OrderStatus,
                co.TotalAmount,
                co.OrderDateTime,
                co.UpdatedAt,
                fs.StallID,
                fs.StallName,
                fs.StallImage,
                p.PaymentMethod,
                p.PaymentStatus
            ORDER BY co.OrderDateTime DESC;
        `);

        return result.recordset;
    } catch (error) {
        console.error(
            "Database error (getActiveOrderHistory):",
            error
        );
        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Retrieve completed and cancelled orders so customers can view their order history
async function getPreviousOrderHistory(userId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("UserID", sql.Int, userId);

        const result = await request.query(`
            SELECT
                co.OrderID,
                co.OrderStatus,
                co.TotalAmount,
                co.OrderDateTime,
                co.UpdatedAt,
                fs.StallID,
                fs.StallName,
                fs.StallImage,
                p.PaymentMethod,
                p.PaymentStatus,
                SUM(oi.Quantity) AS TotalQuantity
            FROM CustomerOrder co
            JOIN OrderItem oi
                ON co.OrderID = oi.OrderID
            JOIN MenuItem mi
                ON oi.MenuItemID = mi.MenuItemID
            JOIN FoodStall fs
                ON mi.StallID = fs.StallID
            LEFT JOIN Payment p
                ON co.OrderID = p.OrderID
            WHERE
                co.UserID = @UserID
                AND co.OrderStatus IN (
                    'Completed',
                    'Cancelled'
                )
            GROUP BY
                co.OrderID,
                co.OrderStatus,
                co.TotalAmount,
                co.OrderDateTime,
                co.UpdatedAt,
                fs.StallID,
                fs.StallName,
                fs.StallImage,
                p.PaymentMethod,
                p.PaymentStatus
            ORDER BY co.OrderDateTime DESC;
        `);

        return result.recordset;
    } catch (error) {
        console.error(
            "Database error (getPreviousOrderHistory):",
            error
        );
        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Retrieve complete order details for the authenticated customer
// The response includes order information, ordered items and the order status timeline
async function getOrderHistoryById(orderId, userId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const orderRequest = connection.request();
        orderRequest.input("OrderID", sql.Int, orderId);
        orderRequest.input("UserID", sql.Int, userId);

        const orderResult = await orderRequest.query(`
            SELECT DISTINCT
                co.OrderID,
                co.OrderType,
                co.OrderStatus,
                co.TotalAmount,
                co.SpecialInstructions,
                co.OrderDateTime,
                co.UpdatedAt,
                fs.StallID,
                fs.StallName,
                fs.StallUnitNo,
                fs.StallImage,
                hc.HCName,
                hc.HCAddress,
                p.PaymentID,
                p.PaymentMethod,
                p.PaymentStatus AS RecordedPaymentStatus,
                p.Amount AS PaymentAmount,
                p.PaidAt
            FROM CustomerOrder co
            JOIN OrderItem oi
                ON co.OrderID = oi.OrderID
            JOIN MenuItem mi
                ON oi.MenuItemID = mi.MenuItemID
            JOIN FoodStall fs
                ON mi.StallID = fs.StallID
            JOIN HawkerCentre hc
                ON fs.HawkerCentreID = hc.HawkerCentreID
            LEFT JOIN Payment p
                ON co.OrderID = p.OrderID
            WHERE
                co.OrderID = @OrderID
                AND co.UserID = @UserID
                AND co.OrderType = 'Member';
        `);

        if (orderResult.recordset.length === 0) {
            return null;
        }

        const order = orderResult.recordset[0];

        // Retrieve every menu item that belongs to the selected order
        const itemRequest = connection.request();
        itemRequest.input("OrderID", sql.Int, orderId);

        const itemResult = await itemRequest.query(`
            SELECT
                oi.OrderItemID,
                oi.MenuItemID,
                mi.ItemName,
                mi.ItemImage,
                oi.Quantity,
                oi.UnitPrice,
                oi.Subtotal
            FROM OrderItem oi
            JOIN MenuItem mi
                ON oi.MenuItemID = mi.MenuItemID
            WHERE oi.OrderID = @OrderID
            ORDER BY oi.OrderItemID;
        `);

        // Retrieve the complete order status history
        // Customer can track the order's progress
        const timelineRequest = connection.request();
        timelineRequest.input("OrderID", sql.Int, orderId);

        const timelineResult = await timelineRequest.query(`
            SELECT
                OrderStatus,
                StatusDateTime
            FROM OrderStatusHistory
            WHERE OrderID = @OrderID
            ORDER BY StatusDateTime ASC;
        `);

        return {
            order,
            items: itemResult.recordset,
            timeline: timelineResult.recordset,
        };
    } catch (error) {
        console.error(
            "Database error (getOrderHistoryById):",
            error
        );
        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Retrieves a guest order using the Order ID and
// Guest Order Reference stored after checkout
// This allows guests to access their order history without creating an account
async function getGuestOrderHistory(orderId, guestOrderReference) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        // Retrieve the guest order together with its stall, hawker centre and payment information
        const orderRequest = connection.request();

        orderRequest.input("OrderID", sql.Int, orderId);
        orderRequest.input("GuestOrderReference", sql.VarChar(50), guestOrderReference);

        const orderResult = await orderRequest.query(`
            SELECT DISTINCT
                co.OrderID,
                co.GuestOrderReference,
                co.OrderStatus,
                co.TotalAmount,
                co.SpecialInstructions,
                co.OrderDateTime,
                co.UpdatedAt,
                fs.StallID,
                fs.StallName,
                fs.StallUnitNo,
                fs.StallImage,
                hc.HCName,
                hc.HCAddress,
                p.PaymentID,
                p.PaymentMethod,
                p.PaymentStatus,
                p.TransactionReference
            FROM CustomerOrder co
            JOIN OrderItem oi
                ON co.OrderID = oi.OrderID
            JOIN MenuItem mi
                ON oi.MenuItemID = mi.MenuItemID
            JOIN FoodStall fs
                ON mi.StallID = fs.StallID
            JOIN HawkerCentre hc
                ON fs.HawkerCentreID = hc.HawkerCentreID
            LEFT JOIN Payment p
                ON co.OrderID = p.OrderID
            WHERE co.OrderID = @OrderID
                AND co.GuestOrderReference = @GuestOrderReference
                AND co.OrderType = 'Guest';
        `);

        if (orderResult.recordset.length === 0) {
            return null;
        }

        // Retrieve every menu item included in the guest's order
        const itemRequest = connection.request();
        itemRequest.input("OrderID", sql.Int, orderId);

        const itemResult = await itemRequest.query(`
            SELECT
                oi.MenuItemID,
                mi.ItemName,
                oi.Quantity,
                oi.UnitPrice,
                oi.Subtotal
            FROM OrderItem oi
            INNER JOIN MenuItem mi
                ON oi.MenuItemID = mi.MenuItemID
            WHERE oi.OrderID = @OrderID;
        `);

        // Retrieve the complete order status history for the guest's order
        const timelineRequest = connection.request();
        timelineRequest.input("OrderID", sql.Int, orderId);

        const timelineResult = await timelineRequest.query(`
            SELECT
                OrderStatus,
                StatusDateTime
            FROM OrderStatusHistory
            WHERE OrderID = @OrderID
            ORDER BY StatusDateTime ASC;
        `);

        return {
            order: orderResult.recordset[0],
            items: itemResult.recordset,
            timeline: timelineResult.recordset
        };
    } catch (error) {
        console.error(
            "Error retrieving guest order history:",
            error
        );

        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

module.exports = {
    getActiveOrderHistory,
    getPreviousOrderHistory,
    getOrderHistoryById,
    getGuestOrderHistory,
};