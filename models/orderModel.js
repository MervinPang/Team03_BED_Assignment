const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Order Model - Handles database operations for Place Food Order

// Generate a reference used by guests to access their order securely
function generateGuestOrderReference() {
    const timestamp = Date.now().toString(36).toUpperCase();

    const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();

    return `GUEST-${timestamp}-${randomPart}`;
}

// Retrieve all customer orders
async function getAllOrders(user) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("UserID", sql.Int, user.id);
        request.input("Role", sql.VarChar(20), user.role);

        const result = await request.query(`
            SELECT DISTINCT
                co.OrderID,
                co.OrderType,
                co.OrderStatus,
                ISNULL(ua.Username, co.GuestName) AS CustomerName,
                co.TotalAmount,
                co.OrderDateTime,
                co.UpdatedAt
            FROM CustomerOrder co
            LEFT JOIN UserAccount ua ON co.UserID = ua.UserID
            WHERE
            (
                @Role = 'customer'
                AND co.UserID = @UserID
            )
            OR
            (
                @Role = 'vendor'
                AND EXISTS (
                    SELECT 1
                    FROM OrderItem oi
                    JOIN MenuItem mi
                        ON oi.MenuItemID = mi.MenuItemID
                    JOIN FoodStall fs
                        ON mi.StallID = fs.StallID
                    WHERE oi.OrderID = co.OrderID
                    AND fs.VendorUserID = @UserID
                )
            )
            OR
            (
                @Role = 'nea_officer'
            )
            ORDER BY co.OrderDateTime DESC;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getAllOrders):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Get full order details by ID
async function getOrderById(orderId, user, allowInternalAccess = false) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const orderRequest = connection.request();
        orderRequest.input("OrderID", sql.Int, orderId);
        orderRequest.input("UserID", sql.Int, user?.id || null);
        orderRequest.input("Role", sql.VarChar(20), user?.role || null);
        orderRequest.input("AllowInternalAccess", sql.Bit, allowInternalAccess);

        const orderResult = await orderRequest.query(`
            SELECT 
                co.OrderID,
                co.UserID,
                co.GuestName,
                co.GuestEmail,
                co.GuestOrderReference,
                co.OrderType,
                co.OrderStatus,
                co.TotalAmount,
                co.SpecialInstructions,
                co.OrderDateTime,
                co.UpdatedAt,
                ISNULL(ua.Username, co.GuestName) AS CustomerName
            FROM CustomerOrder co
            LEFT JOIN UserAccount ua ON co.UserID = ua.UserID
            WHERE
                co.OrderID = @OrderID
                AND (
                    @AllowInternalAccess = 1
                    OR (
                        @Role = 'customer'
                        AND co.UserID = @UserID
                    )
                    OR (
                        @Role = 'vendor'
                        AND EXISTS (
                            SELECT 1
                            FROM OrderItem oi
                            JOIN MenuItem mi
                                ON oi.MenuItemID = mi.MenuItemID
                            JOIN FoodStall fs
                                ON mi.StallID = fs.StallID
                            WHERE oi.OrderID = co.OrderID
                                AND fs.VendorUserID = @UserID
                        )
                    )
                    OR (
                        @Role = 'nea_officer'
                    )
                );
        `);

        if (orderResult.recordset.length === 0) {
            return null;
        }

        const itemRequest = connection.request();
        itemRequest.input("OrderID", sql.Int, orderId);

        const itemResult = await itemRequest.query(`
            SELECT
                oi.OrderItemID,
                oi.MenuItemID,
                mi.ItemName,
                fs.StallName,
                oi.Quantity,
                oi.UnitPrice,
                oi.Subtotal
            FROM OrderItem oi
            JOIN MenuItem mi ON oi.MenuItemID = mi.MenuItemID
            JOIN FoodStall fs ON mi.StallID = fs.StallID
            WHERE oi.OrderID = @OrderID;
        `);

        const order = orderResult.recordset[0];

        if (order.OrderType === "Member") {
            delete order.GuestName;
            delete order.GuestEmail;
        }

        return {
            ...order,
            items: itemResult.recordset,
        };

    } catch (error) {
        console.error("Database error (getOrderById):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Create a new order
async function createOrder(orderData, user) {
    let connection;
    let transaction;

    try {
        const isMemberOrder = orderData.OrderType === "Member";
        const isGuestOrder = orderData.OrderType === "Guest";

        if (isMemberOrder && !user) {
            throw new Error(
                "Authentication is required for member orders"
            );
        }

        if (isMemberOrder && user.role !== "customer") {
            throw new Error(
                "Only customers can create member orders"
            );
        }

        if (isGuestOrder && user) {
            throw new Error(
                "Logged-in users must create member orders"
            );
        }

        const userId = isMemberOrder ? user.id : null;
        const guestName = isGuestOrder ? orderData.GuestName : null;
        const guestEmail = isGuestOrder ? orderData.GuestEmail : null;
        const guestOrderReference = isGuestOrder ? generateGuestOrderReference() : null;

        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();

        let totalAmount = 0;
        const validatedItems = [];
        let selectedStallId = null;

        // Fetch prices from database instead of trusting frontend price
        for (const item of orderData.items) {
            const menuRequest = new sql.Request(transaction);
            menuRequest.input("MenuItemID", sql.Int, item.MenuItemID);

            const menuResult = await menuRequest.query(`
                SELECT
                mi.MenuItemID,
                mi.ItemPrice,
                mi.IsAvailable,
                mi.StallID,
                fs.IsActive
                FROM MenuItem mi
                JOIN FoodStall fs
                    ON mi.StallID = fs.StallID
                WHERE mi.MenuItemID = @MenuItemID;
            `);

            if (menuResult.recordset.length === 0) {
                throw new Error(`Menu item ${item.MenuItemID} does not exist`);
            }

            const menuItem = menuResult.recordset[0];

            if (!menuItem.IsAvailable) {
                throw new Error(`Menu item ${item.MenuItemID} is not available`);
            }

            if (!menuItem.IsActive) {
                throw new Error(
                    "The selected food stall is currently unavailable"
                );
            }

            if (selectedStallId === null) {
                selectedStallId = menuItem.StallID;
            }

            if (menuItem.StallID !== selectedStallId) {
                throw new Error(
                    "All items in an order must come from the same food stall"
                );
            }

            const quantity = item.Quantity;
            const unitPrice = menuItem.ItemPrice;

            if (!Number.isFinite(unitPrice)) {
                throw new Error(
                    `Invalid price configured for menu item ${item.MenuItemID}`
                );
            }

            const subtotal = quantity * unitPrice;

            totalAmount += subtotal;

            validatedItems.push({
                MenuItemID: item.MenuItemID,
                Quantity: quantity,
                UnitPrice: unitPrice,
            });
        }

        const orderRequest = new sql.Request(transaction);
        orderRequest.input("UserID", sql.Int, userId);
        orderRequest.input("GuestName", sql.VarChar(80), guestName);
        orderRequest.input("GuestEmail", sql.VarChar(100), guestEmail);
        orderRequest.input("GuestOrderReference", sql.VarChar(50), guestOrderReference);
        orderRequest.input("OrderType", sql.VarChar(20), orderData.OrderType);
        orderRequest.input("TotalAmount", sql.Decimal(8, 2), totalAmount);
        orderRequest.input("SpecialInstructions", sql.VarChar(300), orderData.SpecialInstructions ?? null);

        const orderResult = await orderRequest.query(`
            INSERT INTO CustomerOrder
                (UserID, GuestName, GuestEmail, OrderType, GuestOrderReference, TotalAmount, SpecialInstructions)
            VALUES
                (@UserID, @GuestName, @GuestEmail, @OrderType, @GuestOrderReference, @TotalAmount, @SpecialInstructions);

            SELECT SCOPE_IDENTITY() AS OrderID;
        `);

        const newOrderId = Number(orderResult.recordset[0].OrderID);

        // Record the initial order status for the tracking timeline
        const statusHistoryRequest = new sql.Request(transaction);
        statusHistoryRequest.input("OrderID", sql.Int, newOrderId);
        statusHistoryRequest.input("OrderStatus", sql.VarChar(30), "Pending");
        statusHistoryRequest.input("UpdatedByUserID", sql.Int, userId);

        await statusHistoryRequest.query(`
            INSERT INTO OrderStatusHistory
                (OrderID, OrderStatus, UpdatedByUserID)
            VALUES
                (@OrderID, @OrderStatus, @UpdatedByUserID);
        `);

        // Insert food items for the order
        for (const item of validatedItems) {
            const itemRequest = new sql.Request(transaction);

            itemRequest.input("OrderID", sql.Int, newOrderId);
            itemRequest.input("MenuItemID", sql.Int, item.MenuItemID);
            itemRequest.input("Quantity", sql.Int, item.Quantity);
            itemRequest.input("UnitPrice", sql.Decimal(6, 2), item.UnitPrice);

            await itemRequest.query(`
                INSERT INTO OrderItem
                    (OrderID, MenuItemID, Quantity, UnitPrice)
                VALUES
                    (@OrderID, @MenuItemID, @Quantity, @UnitPrice);
            `);
        }

        await transaction.commit();

        return await getOrderById(newOrderId, user, true);
    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Rollback error:", rollbackError);
            }
        }

        console.error("Database error (createOrder):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Update order status
async function updateOrderStatus(orderId, orderStatus, user) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("OrderID", sql.Int, orderId);
        request.input("OrderStatus", sql.VarChar(30), orderStatus);
        request.input("UserID", sql.Int, user.id);

        const result = await request.query(`
            UPDATE co
            SET 
                co.OrderStatus = @OrderStatus,
                co.UpdatedAt = GETDATE()
            FROM CustomerOrder co
            WHERE co.OrderID = @OrderID
            AND EXISTS (
                SELECT 1
                FROM OrderItem oi
                JOIN MenuItem mi ON oi.MenuItemID = mi.MenuItemID
                JOIN FoodStall fs ON mi.StallID = fs.StallID
                WHERE oi.OrderID = co.OrderID
                  AND fs.VendorUserID = @UserID
            );
        `);

        if (result.rowsAffected[0] === 0) {
            return null;
        }

        return await getOrderById(orderId, user);
    } catch (error) {
        console.error("Database error (updateOrderStatus):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Delete order by ID
async function deleteOrder(orderId, user) {
    let connection;
    let transaction;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        // Transaction ensures payment, order items and order are deleted together
        await transaction.begin();

        const ownershipRequest = new sql.Request(transaction);
        ownershipRequest.input("OrderID", sql.Int, orderId);
        ownershipRequest.input("UserID", sql.Int, user.id);

        const ownershipResult = await ownershipRequest.query(`
            SELECT OrderID, OrderStatus
            FROM CustomerOrder
            WHERE OrderID = @OrderID
              AND UserID = @UserID;
        `);

        if (ownershipResult.recordset.length === 0) {
            await transaction.rollback();
            return null;
        }

        const order = ownershipResult.recordset[0];

        if (order.OrderStatus !== "Pending") {
            throw new Error("Only pending orders can be deleted");
        }

        const paymentRequest = new sql.Request(transaction);
        paymentRequest.input("OrderID", sql.Int, orderId);

        const paymentResult = await paymentRequest.query(`
            SELECT PaymentStatus
            FROM Payment
            WHERE OrderID = @OrderID;
        `);

        if (
            paymentResult.recordset.some(
                (payment) => payment.PaymentStatus === "Successful"
            )
        ) {
            throw new Error("Paid orders cannot be deleted");
        }

        const deletePaymentRequest = new sql.Request(transaction);
        deletePaymentRequest.input("OrderID", sql.Int, orderId);
        await deletePaymentRequest.query(`
            DELETE FROM Payment WHERE OrderID = @OrderID;
        `);

        const deleteItemsRequest = new sql.Request(transaction);
        deleteItemsRequest.input("OrderID", sql.Int, orderId);
        await deleteItemsRequest.query(`
            DELETE FROM OrderItem
            WHERE OrderID = @OrderID;
        `);

        const deleteOrderRequest = new sql.Request(transaction);
        deleteOrderRequest.input("OrderID", sql.Int, orderId);

        const result = await deleteOrderRequest.query(`
            DELETE FROM CustomerOrder
            WHERE OrderID = @OrderID;
        `);

        await transaction.commit();

        return result.rowsAffected[0] > 0;
    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Rollback error:", rollbackError);
            }
        }

        console.error("Database error (deleteOrder):", error);
        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Export model functions for use in OrderController
module.exports = {
    createOrder,
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    deleteOrder,
};