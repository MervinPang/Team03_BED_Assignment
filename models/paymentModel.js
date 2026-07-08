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

async function createPayment(paymentData) { }

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