const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Retrieve active orders for a registered customer
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

// Retrieve completed and cancelled orders for a registered customer
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

// Retrieve full details for one registered customer's order
async function getOrderHistoryById(orderId, userId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const orderRequest = connection.request();
        orderRequest.input("OrderID", sql.Int, orderId);
        orderRequest.input("UserID", sql.Int, userId);

        const orderResult = await orderRequest.query(`
            SELECT
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
                AND co.UserID = @UserID;
        `);

        if (orderResult.recordset.length === 0) {
            return null;
        }

        const order = orderResult.recordset[0];

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
            OrderID: order.OrderID,
            OrderType: order.OrderType,
            OrderStatus: order.OrderStatus,
            TotalAmount: order.TotalAmount,
            SpecialInstructions: order.SpecialInstructions,
            OrderDateTime: order.OrderDateTime,
            UpdatedAt: order.UpdatedAt,

            Stall: {
                StallID: order.StallID,
                StallName: order.StallName,
                StallUnitNo: order.StallUnitNo,
                StallImage: order.StallImage,
            },

            HawkerCentre: {
                Name: order.HCName,
                Address: order.HCAddress,
            },

            Payment: order.PaymentID
                ? {
                      PaymentID: order.PaymentID,
                      PaymentMethod: order.PaymentMethod,
                      PaymentStatus:
                          order.RecordedPaymentStatus,
                      Amount: order.PaymentAmount,
                      PaidAt: order.PaidAt,
                  }
                : null,

            Items: itemResult.recordset,
            Timeline: timelineResult.recordset,
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

// Retrieve one guest order using values stored in localStorage
async function getGuestOrderHistory(orderId, guestOrderReference) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("OrderID", sql.Int, orderId);
        request.input("GuestOrderReference", sql.VarChar(50), guestOrderReference);

        const result = await request.query(`
            SELECT
                co.OrderID,
                co.OrderStatus,
                co.TotalAmount,
                co.SpecialInstructions,
                co.OrderDateTime,
                co.UpdatedAt,
                fs.StallName,
                fs.StallImage,
                p.PaymentMethod,
                p.PaymentStatus
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
                co.OrderID = @OrderID
                AND co.OrderType = 'Guest'
                AND co.UserID IS NULL
                AND co.GuestOrderReference =
                    @GuestOrderReference;
        `);

        if (result.recordset.length === 0) {
            return null;
        }

        return result.recordset[0];
    } catch (error) {
        console.error(
            "Database error (getGuestOrderHistory):",
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