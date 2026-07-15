const paymentModel = require("../models/paymentModel");

// Payment Controller - Handles HTTP requests for Checkout and Payment

// Retrieve all payments
async function getAllPayments(req, res) {
    try {
        const payments = await paymentModel.getAllPayments(req.user);
        res.json(payments);
    } catch (error) {
        console.error("Controller error (getAllPayments):", error);
        res.status(500).json({ error: "Error retrieving payments" });
    }
}

// Retrieve payment by Payment ID
async function getPaymentById(req, res) {
    try {
        const id = parseInt(req.params.id);

        const payment = await paymentModel.getPaymentById(id, req.user);

        if (!payment) {
            return res.status(404).json({
                error: "Payment not found",
            });
        }

        res.json(payment);

    } catch (error) {
        console.error("Controller error (getPaymentById):", error);
        res.status(500).json({
            error: "Error retrieving payment",
        });
    }
}

// Retrieve payment by Order ID
async function getPaymentByOrderId(req, res) {
    try {
        const orderId = parseInt(req.params.orderId);

        const payment = await paymentModel.getPaymentByOrderId(orderId, req.user);

        if (!payment) {
            return res.status(404).json({
                error: "Payment not found for this order",
            });
        }

        res.json(payment);

    } catch (error) {
        console.error("Controller error (getPaymentByOrderId):", error);
        res.status(500).json({
            error: "Error retrieving payment by order ID",
        });
    }
}

// Create new payment
async function createPayment(req, res) {
    try {
        const newPayment = await paymentModel.createPayment(req.body, req.user);
        res.status(201).json(newPayment);
    } catch (error) {
        console.error("Controller error (createPayment):", error);

        if (
            error.message === "Order does not exist or you do not have access to this order"
        ) {
             return res.status(404).json({
                error: error.message,
             });
        }

        if (
            error.message === "Payment has already been made for this order" ||
            error.message === "Payment amount does not match order total"
        ) {
            return res.status(409).json({
                error: error.message,
            });
        }

        res.status(500).json({
            error: "Error creating payment",
        });
    }
}

// Update payment status
async function updatePaymentStatus(req, res) {
    try {
        const id = parseInt(req.params.id);

        const updatedPayment = await paymentModel.updatePaymentStatus(
            id,
            req.body.PaymentStatus,
            req.user
        );

        if (!updatedPayment) {
            return res.status(404).json({
                error: "Payment not found",
            });
        }

        res.json(updatedPayment);
    } catch (error) {
        console.error("Controller error (updatePaymentStatus):", error);
        res.status(500).json({
            error: "Failed to update payment status",
        });
    }
}

// Delete payment
async function deletePayment(req, res) {
    try {
        const id = parseInt(req.params.id);

        const deleted = await paymentModel.deletePayment(id, req.user);

        if (!deleted) {
            return res.status(404).json({
                error: "Payment not found",
            });
        }

        res.status(204).send();
    } catch (error) {
        console.error("Controller error (deletePayment):", error);
        res.status(500).json({
            error: "Failed to delete payment",
        });
    }
}

// Export controller functions for use in payment routes
module.exports = {
    createPayment,
    getAllPayments,
    getPaymentById,
    getPaymentByOrderId,
    updatePaymentStatus,
    deletePayment,
};