const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Order Model - Handles database operations for Place Food Order

// Generates a unique guest reference that acts
// as a secure lookup token for guest orders
// This avoids exposing customer information while
// allowing guests to retrieve their own orders
function generateGuestOrderReference() {
    const timestamp = Date.now().toString(36).toUpperCase();

    const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();

    return `GUEST-${timestamp}-${randomPart}`;
}

// Retrieve all orders based on authenticated user's role
// Customer : Own orders only
// Vendor : Orders containing menu items from stalls they own
// NEA : All orders
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

// Retrieves complete order information while enforcing role-based access control
// Guest-specific information is removed from member orders and guest order references
// are only returned during internal creation
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
            delete order.GuestOrderReference;
        }

        // Only return the reference immediately after internal guest creation
        if (!allowInternalAccess) {
            delete order.GuestOrderReference;
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

// Create a new customer order using a database transaction
// This ensures the order, initial status history and all order items are
// either saved together or rolled back if an error occurs
async function createOrder(orderData, user) {
    let connection;
    let transaction;
    let transactionStarted = false;

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
        transactionStarted = true;

        let totalAmount = 0;
        const validatedItems = [];
        let selectedStallId = null;

        // Always retrieve the latest menu price from the database rather than client-supplied values
        // Preventing price manipulation attacks
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

        // Record the initial order status to establish a complete audit trail for the order lifecycle
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
        transactionStarted = false;

        return await getOrderById(newOrderId, user, true);
    } catch (error) {
        if (transaction && transactionStarted) {
            try {
                await transaction.rollback();
                transactionStarted = false;
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

// Updates an order's lifecycle status
// Vendor ownership is verified and only valid status transitions are permitted before the
// change is committed to the database
async function updateOrderStatus(orderId, orderStatus, user) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        // Retrieve the current status and verify vendor ownership
        const currentOrderRequest = new sql.Request(transaction);

        currentOrderRequest.input("OrderID", sql.Int, orderId);
        currentOrderRequest.input("UserID", sql.Int, user.id);
        const currentOrderResult =
            await currentOrderRequest.query(`
                SELECT
                    co.OrderID,
                    co.OrderStatus
                FROM CustomerOrder co
                WHERE
                    co.OrderID = @OrderID
                    AND EXISTS
                    (
                        SELECT 1
                        FROM OrderItem oi
                        JOIN MenuItem mi
                            ON oi.MenuItemID =
                               mi.MenuItemID
                        JOIN FoodStall fs
                            ON mi.StallID =
                               fs.StallID
                        WHERE
                            oi.OrderID =
                                co.OrderID
                            AND fs.VendorUserID =
                                @UserID
                    );
            `);

        if (currentOrderResult.recordset.length === 0) {
            await transaction.rollback();
            transactionStarted = false;
            return null;
        }

        const currentStatus = currentOrderResult.recordset[0].OrderStatus;

        // State transition rules ensure orders progress through the workflow in a controlled sequence
        const allowedTransitions = {
            Pending: ["Preparing", "Cancelled",],
            Preparing: ["Ready", "Cancelled",],
            Ready: ["Completed",],
            Completed: [],
            Cancelled: [],
        };

        const allowedNextStatuses = allowedTransitions[currentStatus] || [];

        if (
            !allowedNextStatuses.includes(
                orderStatus
            )
        ) {
            throw new Error(
                `Order status cannot be changed from ${currentStatus} to ${orderStatus}`
            );
        }

        const updateRequest = new sql.Request(transaction);

        updateRequest.input("OrderID", sql.Int, orderId);
        updateRequest.input("OrderStatus", sql.VarChar(30), orderStatus);

        await updateRequest.query(`
            UPDATE CustomerOrder
            SET
                OrderStatus = @OrderStatus,
                UpdatedAt = GETDATE()
            WHERE
                OrderID = @OrderID;
        `);

        // Add the new status to the timeline
        const historyRequest = new sql.Request(transaction);

        historyRequest.input("OrderID", sql.Int, orderId);
        historyRequest.input("OrderStatus", sql.VarChar(30), orderStatus);
        historyRequest.input("UpdatedByUserID", sql.Int, user.id);

        await historyRequest.query(`
            INSERT INTO OrderStatusHistory
            (
                OrderID,
                OrderStatus,
                UpdatedByUserID
            )
            VALUES
            (
                @OrderID,
                @OrderStatus,
                @UpdatedByUserID
            );
        `);

        await transaction.commit();
        transactionStarted = false;

        return await getOrderById(orderId, user);
    } catch (error) {
        if (transaction && transactionStarted) {
            try {
                await transaction.rollback();
                transactionStarted = false;
            } catch (rollbackError) {
                console.error(
                    "Rollback error:",
                    rollbackError
                );
            }
        }
        console.error("Database error (updateOrderStatus):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Cancels a pending member order using a transaction
// The order and related records are preserved for order history
async function deleteOrder(orderId, user) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        // Transaction ensures the status update and timeline entry are committed together
        await transaction.begin();
        transactionStarted = true;

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
            transactionStarted = false;
            return null;
        }

        const order = ownershipResult.recordset[0];

        if (order.OrderStatus !== "Pending") {
            throw new Error("Only pending orders can be cancelled");
        }

        const paymentRequest = new sql.Request(transaction);
        paymentRequest.input("OrderID", sql.Int, orderId);

        // Successful payments prevent deletion to preserve completed financial transactions
        const paymentResult = await paymentRequest.query(`
            SELECT PaymentStatus
            FROM Payment
            WHERE OrderID = @OrderID;
        `);

        if (
            paymentResult.recordset.some(
                payment => payment.PaymentStatus === "Successful"
            )
        ) {
            throw new Error("Paid orders cannot be cancelled");
        }

        const updateOrderRequest = new sql.Request(transaction);

        updateOrderRequest.input("OrderID", sql.Int, orderId);
        updateOrderRequest.input("UserID", sql.Int, user.id);

        const updateResult = await updateOrderRequest.query(`
            UPDATE CustomerOrder
            SET
                OrderStatus = 'Cancelled',
                UpdatedAt = GETDATE()
            WHERE
                OrderID = @OrderID
                AND UserID = @UserID
                AND OrderStatus = 'Pending';
        `);

        if (updateResult.rowsAffected[0] === 0) {
            await transaction.rollback();
            transactionStarted = false;
            return null;
        }

        const historyRequest = new sql.Request(transaction);

        historyRequest.input("OrderID", sql.Int, orderId);
        historyRequest.input("UpdatedByUserID", sql.Int, user.id);

        await historyRequest.query(`
            INSERT INTO OrderStatusHistory
            (
                OrderID,
                OrderStatus,
                UpdatedByUserID,
                StatusDateTime
            )
            VALUES
            (
                @OrderID,
                'Cancelled',
                @UpdatedByUserID,
                GETDATE()
            );
        `);

        await transaction.commit();
        transactionStarted = false;

        return true;
    } catch (error) {
        if (transaction && transactionStarted) {
            try {
                await transaction.rollback();
                transactionStarted = false;
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

// Cancels a pending guest order using the guest order reference
// Successfully paid PayNow and Card orders cannot be cancelled
async function cancelGuestOrder(orderId, guestOrderReference) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        // Verify that the Order ID and guest reference
        // belong to the same guest order
        const orderRequest = new sql.Request(transaction);

        orderRequest.input("OrderID", sql.Int, orderId);
        orderRequest.input("GuestOrderReference", sql.VarChar(50), guestOrderReference);

        const orderResult = await orderRequest.query(`
            SELECT
                OrderID,
                OrderType,
                OrderStatus
            FROM CustomerOrder
            WHERE
                OrderID = @OrderID
                AND GuestOrderReference = @GuestOrderReference
                AND OrderType = 'Guest';
        `);

        if (orderResult.recordset.length === 0) {
            await transaction.rollback();
            transactionStarted = false;
            return null;
        }

        const order = orderResult.recordset[0];

        if (order.OrderStatus !== "Pending") {
            throw new Error(
                "Only pending guest orders can be cancelled"
            );
        }

        // Retrieve all payments belonging to the order
        const paymentRequest = new sql.Request(transaction);

        paymentRequest.input("OrderID", sql.Int, orderId);

        const paymentResult =
            await paymentRequest.query(`
                SELECT
                    PaymentMethod,
                    PaymentStatus
                FROM Payment
                WHERE OrderID = @OrderID;
            `);

        // Successfully paid electronic orders cannot
        // be cancelled by the guest
        const hasSuccessfulPayment =
            paymentResult.recordset.some(
                (payment) =>
                    payment.PaymentStatus === "Successful"
            );

        if (hasSuccessfulPayment) {
            throw new Error(
                "Paid orders cannot be cancelled"
            );
        }

        // Update instead of deleting so the cancelled order
        // remains available in the order history
        const updateRequest = new sql.Request(transaction);

        updateRequest.input("OrderID", sql.Int, orderId);
        updateRequest.input("GuestOrderReference", sql.VarChar(50), guestOrderReference);

        const updateResult =
            await updateRequest.query(`
                UPDATE CustomerOrder
                SET
                    OrderStatus = 'Cancelled',
                    UpdatedAt = GETDATE()
                WHERE
                    OrderID = @OrderID
                    AND GuestOrderReference =
                        @GuestOrderReference
                    AND OrderType = 'Guest'
                    AND OrderStatus = 'Pending';
            `);

        if (updateResult.rowsAffected[0] === 0) {
            await transaction.rollback();
            transactionStarted = false;
            return null;
        }

        // Add the cancellation to the guest order timeline
        const historyRequest = new sql.Request(transaction);

        historyRequest.input("OrderID", sql.Int, orderId);

        await historyRequest.query(`
            INSERT INTO OrderStatusHistory
            (
                OrderID,
                OrderStatus,
                StatusDateTime
            )
            VALUES
            (
                @OrderID,
                'Cancelled',
                GETDATE()
            );
        `);

        await transaction.commit();
        transactionStarted = false;

        return {
            OrderID: orderId,
            OrderStatus: "Cancelled",
        };
    } catch (error) {
        if (transaction && transactionStarted) {
            try {
                await transaction.rollback();
                transactionStarted = false;
            } catch (rollbackError) {
                console.error(
                    "Guest cancellation rollback error:",
                    rollbackError
                );
            }
        }

        console.error(
            "Database error (cancelGuestOrder):",
            error
        );

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
    cancelGuestOrder,
};