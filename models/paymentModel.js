const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Payment Model - Handles database operations for Checkout and Payment

async function getAllPayments() {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const result = await connection.request().query(`
            SELECT
                p.PaymentID,
                p.OrderID,
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

async function getPaymentById(paymentId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("PaymentID", sql.Int, paymentId);

        const result = await request.query(`
            SELECT
                p.PaymentID,
                p.OrderID,
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
            WHERE p.PaymentID = @PaymentID;
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

async function getPaymentByOrderId(orderId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("OrderID", sql.Int, orderId);

        const result = await request.query(`
            SELECT
                p.PaymentID,
                p.OrderID,
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
            WHERE p.OrderID = @OrderID;
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

async function createPayment(paymentData) {
    let connection;
    let transaction;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();

        // Check that the order exists and retrieve the actual total amount
        const orderRequest = new sql.Request(transaction);
        orderRequest.input("OrderID", sql.Int, paymentData.OrderID);

        const orderResult = await orderRequest.query(`
            SELECT OrderID, TotalAmount
            FROM CustomerOrder
            WHERE OrderID = @OrderID;
        `);

        if (orderResult.recordset.length === 0) {
            throw new Error("Order does not exist");
        }

        const order = orderResult.recordset[0];

        // Prevent duplicate payment for the same order
        const existingPaymentRequest = new sql.Request(transaction);
        existingPaymentRequest.input("OrderID", sql.Int, paymentData.OrderID);

        const existingPaymentResult = await existingPaymentRequest.query(`
            SELECT PaymentID
            FROM Payment
            WHERE OrderID = @OrderID;
        `);

        if (existingPaymentResult.recordset.length > 0) {
            throw new Error("Payment already exists for this order");
        }

        // Amount must match order total
        if (Number(paymentData.Amount) !== Number(order.TotalAmount)) {
            throw new Error("Payment amount does not match order total");
        }

        const paymentStatus =
            paymentData.PaymentStatus ||
            (paymentData.PaymentMethod === "Cash" ? "Pending" : "Successful");

        const paidAt = paymentStatus === "Successful" ? new Date() : null;

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

        await transaction.commit();

        return await getPaymentById(newPaymentId);
    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
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

async function updatePaymentStatus(paymentId, paymentStatus) { }

async function deletePayment(paymentId) { }

module.exports = {
    createPayment,
    getAllPayments,
    getPaymentById,
    getPaymentByOrderId,
    updatePaymentStatus,
    deletePayment,
};