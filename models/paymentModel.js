const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Payment Model - Handles database operations for Checkout and Payment

// Retrieve all payments
async function getAllPayments(user) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("UserID", sql.Int, user.id);
        request.input("Role", sql.VarChar(20), user.role);

        const result = await request.query(`
            SELECT
                p.PaymentID,
                p.OrderID,
                co.UserID,
                ISNULL(ua.Username, co.GuestName) AS CustomerName,
                p.PaymentMethod,
                p.PaymentStatus,
                p.Amount,
                p.TransactionReference,
                p.PaidAt,
                p.CreatedAt,
                co.OrderStatus,
                co.TotalAmount
            FROM Payment p
            JOIN CustomerOrder co ON p.OrderID = co.OrderID
            LEFT JOIN UserAccount ua ON co.UserID = ua.UserID
            WHERE
            (
                @Role='customer'
                AND co.UserID=@UserID
            )
            OR
            (
                @Role='vendor'
                AND EXISTS
                (
                    SELECT 1
                    FROM OrderItem oi
                    JOIN MenuItem mi
                        ON oi.MenuItemID=mi.MenuItemID
                    JOIN FoodStall fs
                        ON mi.StallID=fs.StallID
                    WHERE
                        oi.OrderID=co.OrderID
                        AND fs.VendorUserID=@UserID
                )
            )
            ORDER BY p.CreatedAt DESC;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getAllPayments):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Retrieve payment by Payment ID
async function getPaymentById(paymentId, user) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("PaymentID", sql.Int, paymentId);
        request.input("UserID", sql.Int, user?.id || null);
        request.input("Role", sql.VarChar(20), user?.role || null);

        const result = await request.query(`
            SELECT
                p.PaymentID,
                p.OrderID,
                co.UserID,
                ISNULL(ua.Username, co.GuestName) AS CustomerName,
                p.PaymentMethod,
                p.PaymentStatus,
                p.Amount,
                p.TransactionReference,
                p.PaidAt,
                p.CreatedAt,
                co.OrderStatus,
                co.TotalAmount
            FROM Payment p
            JOIN CustomerOrder co
                ON p.OrderID = co.OrderID
            LEFT JOIN UserAccount ua
                ON co.UserID = ua.UserID
            WHERE
                p.PaymentID = @PaymentID
                AND
                (
                    (
                        @Role='customer'
                        AND co.UserID = @UserID
                    )
                    OR
                    (
                        @Role='vendor'
                        AND EXISTS
                        (
                            SELECT 1
                            FROM OrderItem oi
                            JOIN MenuItem mi
                                ON oi.MenuItemID = mi.MenuItemID
                            JOIN FoodStall fs
                                ON mi.StallID = fs.StallID
                            WHERE
                                oi.OrderID = co.OrderID
                                AND fs.VendorUserID = @UserID
                        )
                    )
                );
            `);

        if (result.recordset.length === 0) {
            return null;
        }

        return result.recordset[0];
    } catch (error) {
        console.error("Database error (getPaymentById):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Retrieve payment by Order ID
async function getPaymentByOrderId(orderId, user) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("OrderID", sql.Int, orderId);
        request.input("UserID", sql.Int, user.id);
        request.input("Role", sql.VarChar(20), user.role);

        const result = await request.query(`
            SELECT
                p.PaymentID,
                p.OrderID,
                co.UserID,
                ISNULL(ua.Username, co.GuestName) AS CustomerName,
                p.PaymentMethod,
                p.PaymentStatus,
                p.Amount,
                p.TransactionReference,
                p.PaidAt,
                p.CreatedAt,
                co.OrderStatus,
                co.TotalAmount
            FROM Payment p
            JOIN CustomerOrder co ON p.OrderID = co.OrderID
            LEFT JOIN UserAccount ua ON co.UserID = ua.UserID
            WHERE
                p.OrderID = @OrderID
                AND (
                    (
                        @Role='customer'
                        AND co.UserID=@UserID
                    )
                    OR
                    (
                        @Role='vendor'
                        AND EXISTS (
                            SELECT 1
                            FROM OrderItem oi
                            JOIN MenuItem mi
                                ON oi.MenuItemID = mi.MenuItemID
                            JOIN FoodStall fs
                                ON mi.StallID = fs.StallID
                            WHERE
                                oi.OrderID = co.OrderID
                            AND fs.VendorUserID = @UserID
                        )
                    )
                );
            `);

        if (result.recordset.length === 0) {
            return null;
        }

        return result.recordset[0];
    } catch (error) {
        console.error("Database error (getPaymentByOrderId):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Create a new payment
async function createPayment(paymentData, user) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        // Open the database connection
        connection = await sql.connect(dbConfig);

        // Create and start the database transaction
        transaction = new sql.Transaction(connection);
        await transaction.begin();
        transactionStarted = true;

        // Verify that the order exists and retrieve the actual total amount
        const orderRequest = new sql.Request(transaction);
        orderRequest.input("OrderID", sql.Int, paymentData.OrderID);
        orderRequest.input("UserID", sql.Int, user.id);

        const orderResult = await orderRequest.query(`
            SELECT OrderID, UserID, TotalAmount, OrderStatus
            FROM CustomerOrder
            WHERE
                OrderID = @OrderID
                AND UserID = @UserID;
        `);

        if (orderResult.recordset.length === 0) {
            throw new Error("Order does not exist or you do not have access to this order");
        }

        const order = orderResult.recordset[0];

        // Payment is only allowed while the order is pending
        if (order.OrderStatus !== "Pending") {
            throw new Error(
                "Payment can only be made for a pending order"
            );
        }

        // Check for an existing payment
        const existingPaymentRequest = new sql.Request(transaction);
        existingPaymentRequest.input("OrderID", sql.Int, paymentData.OrderID);

        const existingPaymentResult = await existingPaymentRequest.query(`
            SELECT PaymentID
            FROM Payment
            WHERE OrderID = @OrderID;
        `);

        if (existingPaymentResult.recordset.length > 0) {
            throw new Error("Payment has already been made for this order");
        }

        // The backend controls the initial payment status
        // Cash requires vendor confirmation, while simulated digital payments
        // are treated as successful
        const paymentStatus =
            paymentData.PaymentMethod === "Cash" ? "Pending" : "Successful";

        const paidAt = paymentStatus === "Successful" ? new Date() : null;

        // Cash may have no reference, while Card and PayNow
        // References are enforced by Joi validation
        const transactionReference = paymentData.PaymentMethod === "Cash" ? paymentData.TransactionReference || null : paymentData.TransactionReference;
        const paymentRequest = new sql.Request(transaction);

        paymentRequest.input("OrderID", sql.Int, paymentData.OrderID);
        paymentRequest.input("PaymentMethod", sql.VarChar(30), paymentData.PaymentMethod);
        paymentRequest.input("PaymentStatus", sql.VarChar(30), paymentStatus);
        paymentRequest.input("Amount", sql.Decimal(10, 2), order.TotalAmount);
        paymentRequest.input("TransactionReference", sql.VarChar(100), transactionReference);
        paymentRequest.input("PaidAt", sql.DateTime, paidAt);

        const paymentResult = await paymentRequest.query(`
            INSERT INTO Payment
                (OrderID, PaymentMethod, PaymentStatus, Amount, TransactionReference, PaidAt)
            VALUES
                (@OrderID, @PaymentMethod, @PaymentStatus, @Amount, @TransactionReference, @PaidAt);

            SELECT SCOPE_IDENTITY() AS PaymentID;
        `);

        const newPaymentId = Number(paymentResult.recordset[0].PaymentID);

        // Save all database changes
        await transaction.commit();
        transactionStarted = false;

        // Retrieve and return the created payment
        return await getPaymentById(newPaymentId, user);
    } catch (error) {
        // Roll back only when the transaction is still active
        if (transaction && transactionStarted) {
            try {
                await transaction.rollback(); // Roll back all changes if an error occurs
                transactionStarted = false;
            } catch (rollbackError) {
                console.error("Rollback error:", rollbackError);
            }
        }

        console.error("Database error (createPayment):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Update payment status
// Update payment status
async function updatePaymentStatus(paymentId, paymentStatus, user) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        // Retrieve the current payment status and verify vendor ownership
        const currentPaymentRequest = new sql.Request(transaction);

        currentPaymentRequest.input(
            "PaymentID",
            sql.Int,
            paymentId
        );

        currentPaymentRequest.input(
            "UserID",
            sql.Int,
            user.id
        );

        const currentPaymentResult =
            await currentPaymentRequest.query(`
                SELECT
                    p.PaymentID,
                    p.PaymentStatus,
                    p.PaidAt
                FROM Payment p
                JOIN CustomerOrder co
                    ON p.OrderID = co.OrderID
                WHERE
                    p.PaymentID = @PaymentID
                    AND EXISTS
                    (
                        SELECT 1
                        FROM OrderItem oi
                        JOIN MenuItem mi
                            ON oi.MenuItemID = mi.MenuItemID
                        JOIN FoodStall fs
                            ON mi.StallID = fs.StallID
                        WHERE
                            oi.OrderID = co.OrderID
                            AND fs.VendorUserID = @UserID
                    );
            `);

        if (currentPaymentResult.recordset.length === 0) {
            await transaction.rollback();
            transactionStarted = false;
            return null;
        }

        const currentPayment =
            currentPaymentResult.recordset[0];

        const currentStatus =
            currentPayment.PaymentStatus;

        // Define valid status transitions
        const allowedTransitions = {
            Pending: ["Successful", "Failed"],
            Successful: ["Refunded"],
            Failed: ["Pending"],
            Refunded: [],
        };

        const allowedNextStatuses =
            allowedTransitions[currentStatus] || [];

        if (!allowedNextStatuses.includes(paymentStatus)) {
            throw new Error(
                `Payment status cannot be changed from ${currentStatus} to ${paymentStatus}`
            );
        }

        const updateRequest = new sql.Request(transaction);

        updateRequest.input("PaymentID", sql.Int, paymentId);

        updateRequest.input("PaymentStatus", sql.VarChar(30), paymentStatus);

        await updateRequest.query(`
            UPDATE Payment
            SET
                PaymentStatus = @PaymentStatus,
                PaidAt =
                    CASE
                        WHEN @PaymentStatus = 'Successful'
                             AND PaidAt IS NULL
                            THEN GETDATE()
                        ELSE PaidAt
                    END
            WHERE PaymentID = @PaymentID;
        `);

        await transaction.commit();
        transactionStarted = false;

        return await getPaymentById(paymentId, user);
    } catch (error) {
        if (transaction && transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error(
                    "Rollback error:",
                    rollbackError
                );
            }
        }

        console.error(
            "Database error (updatePaymentStatus):",
            error
        );

        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Delete payment by Payment ID
async function deletePayment(paymentId, user) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        // Verify payment ownership and retrieve its current state
        const paymentRequest = new sql.Request(transaction);

        paymentRequest.input("PaymentID", sql.Int, paymentId);
        paymentRequest.input("UserID", sql.Int, user.id);

        const paymentResult = await paymentRequest.query(`
            SELECT
                p.PaymentID,
                p.PaymentStatus,
                co.OrderID,
                co.OrderStatus
            FROM Payment p
            JOIN CustomerOrder co
                ON p.OrderID = co.OrderID
            WHERE
                p.PaymentID = @PaymentID
                AND co.UserID = @UserID;
        `);
        if (paymentResult.recordset.length === 0) {
            await transaction.rollback();
            transactionStarted = false;
            return null;
        }

        const payment = paymentResult.recordset[0];

        // Successful or refunded payments should remain for transaction records
        if (
            payment.PaymentStatus === "Successful" ||
            payment.PaymentStatus === "Refunded"
        ) {
            throw new Error(
                "Successful or refunded payments cannot be deleted"
            );
        }

        // Payment deletion is only allowed while the order is pending
        if (payment.OrderStatus !== "Pending") {
            throw new Error(
                "Payments can only be deleted for pending orders"
            );
        }

        const deleteRequest = new sql.Request(transaction);
        deleteRequest.input("PaymentID", sql.Int, paymentId);

        const result = await deleteRequest.query(`
            DELETE FROM Payment
            WHERE PaymentID = @PaymentID;
        `);
        await transaction.commit();
        transactionStarted = false;

        return result.rowsAffected[0] > 0;

    } catch (error) {
        if (transaction && transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Rollback error:", rollbackError);
            }
        }

        console.error("Database error (deletePayment):", error);
        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Export model functions for use in PaymentController
module.exports = {
    createPayment,
    getAllPayments,
    getPaymentById,
    getPaymentByOrderId,
    updatePaymentStatus,
    deletePayment,
};