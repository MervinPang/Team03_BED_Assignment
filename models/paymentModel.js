const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Payment Model - Handles database operations for Checkout and Payment

async function getAllPayments() { }

async function getPaymentById(paymentId) { }

async function getPaymentByOrderId(orderId) { }

async function createPayment(paymentData) { }

async function updatePaymentStatus(paymentId, paymentStatus) { }

async function deletePayment(paymentId) { }

module.exports = {
    getAllPayments,
    getPaymentById,
    getPaymentByOrderId,
    createPayment,
    updatePaymentStatus,
    deletePayment,
};