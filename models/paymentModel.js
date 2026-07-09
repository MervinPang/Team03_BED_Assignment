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
                @Role IN ('vendor', 'nea_officer')
                OR co.UserID = @UserID
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
            JOIN CustomerOrder co ON p.OrderID = co.OrderID
            LEFT JOIN UserAccount ua ON co.UserID = ua.UserID
            WHERE
                p.PaymentID = @PaymentID
                AND (
                    @Role IN ('vendor', 'nea_officer')
                    OR co.UserID = @UserID
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
                    @Role IN ('vendor', 'nea_officer')
                    OR co.UserID = @UserID
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

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        // Start database transaction
        await transaction.begin();

        // Verify that the order exists and retrieve the actual total amount
        const orderRequest = new sql.Request(transaction);
        orderRequest.input("OrderID", sql.Int, paymentData.OrderID);
        orderRequest.input("UserID", sql.Int, user.id);
        orderRequest.input("Role", sql.VarChar(20), user.role);

        const orderResult = await orderRequest.query(`
            SELECT OrderID, UserID, TotalAmount
            FROM CustomerOrder
            WHERE
                OrderID = @OrderID
                AND (
                    @Role IN ('vendor','nea_officer')
                    OR UserID = @UserID
                );
        `);

        if (orderResult.recordset.length === 0) {
            throw new Error("Order does not exist or you do not have access to this order");
        }

        const order = orderResult.recordset[0];

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

        // Verify payment amount matches the order total
        if (Number(paymentData.Amount) !== Number(order.TotalAmount)) {
            throw new Error("Payment amount does not match order total");
        }

        // Determine payment status and payment time
        const paymentStatus =
            paymentData.PaymentStatus ||
            (paymentData.PaymentMethod === "Cash" ? "Pending" : "Successful");

        const paidAt = paymentStatus === "Successful" ? new Date() : null;

        // Insert payment record
        const paymentRequest = new sql.Request(transaction);

        paymentRequest.input("OrderID", sql.Int, paymentData.OrderID);
        paymentRequest.input("PaymentMethod", sql.VarChar(30), paymentData.PaymentMethod);
        paymentRequest.input("PaymentStatus", sql.VarChar(30), paymentStatus);
        paymentRequest.input("Amount", sql.Decimal(8, 2), paymentData.Amount);
        paymentRequest.input("TransactionReference", sql.VarChar(100), paymentData.TransactionReference);
        paymentRequest.input("PaidAt", sql.DateTime, paidAt);

        const paymentResult = await paymentRequest.query(`
            INSERT INTO Payment
                (OrderID, PaymentMethod, PaymentStatus, Amount, TransactionReference, PaidAt)
            VALUES
                (@OrderID, @PaymentMethod, @PaymentStatus, @Amount, @TransactionReference, @PaidAt);

            SELECT SCOPE_IDENTITY() AS PaymentID;
        `);

        const newPaymentId = Number(paymentResult.recordset[0].PaymentID);

        // Commit transaction after payment is created successfully
        await transaction.commit();

        return await getPaymentById(newPaymentId, {
            id: order.UserID,
            role: "customer",
        });
    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback(); // Roll back all changes if an error occurs
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
async function updatePaymentStatus(paymentId, paymentStatus) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const paidAt = paymentStatus === "Successful" ? new Date() : null;

        const request = connection.request();
        request.input("PaymentID", sql.Int, paymentId);
        request.input("PaymentStatus", sql.VarChar(30), paymentStatus);
        request.input("PaidAt", sql.DateTime, paidAt);

        const result = await request.query(`
            UPDATE Payment
            SET
                PaymentStatus = @PaymentStatus,
                PaidAt = @PaidAt
            WHERE PaymentID = @PaymentID;
        `);

        if (result.rowsAffected[0] === 0) {
            return null;
        }

        return await getPaymentById(paymentId, {
            id: null,
            role: "vendor",
        });
    } catch (error) {
        console.error("Database error (updatePaymentStatus):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Delete payment by Payment ID
async function deletePayment(paymentId, user) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("PaymentID", sql.Int, paymentId);
        request.input("UserID", sql.Int, user.id);
        request.input("Role", sql.VarChar(20), user.role);

        const result = await request.query(`
            DELETE p
            FROM Payment p
            JOIN CustomerOrder co ON p.OrderID = co.OrderID
            WHERE
                p.PaymentID = @PaymentID
                AND (
                    @Role IN ('vendor', 'nea_officer')
                    OR co.UserID = @UserID
                );
        `);

        return result.rowsAffected[0] > 0;
    } catch (error) {
        console.error("Database error (deletePayment):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
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