const paymentModel = require("../models/paymentModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Payment Controller - Handles HTTP requests for Checkout and Payment

// Retrieve all payments
async function getAllPayments(req, res) {
    try {
        const payments = await paymentModel.getAllPayments(req.user);
        return res.status(200).json(payments);
    } catch (error) {
        console.error("Controller error (getAllPayments):", error);
        return res.status(500).json({ error: "Error retrieving payments" });
    }
}

// Retrieve payment by Payment ID
async function getPaymentById(req, res) {
    try {
        const paymentId = Number(req.params.id);

        if (!Number.isInteger(paymentId) || paymentId <= 0) {
            return res.status(400).json({ error: "Payment ID must be a positive integer", });
        }

        const payment = await paymentModel.getPaymentById(paymentId, req.user);

        if (!payment) {
            return res.status(404).json({
                error: "Payment not found",
            });
        }

        return res.status(200).json(payment);

    } catch (error) {
        console.error("Controller error (getPaymentById):", error);
        return res.status(500).json({
            error: "Error retrieving payment",
        });
    }
}

// Retrieve payment by Order ID
async function getPaymentByOrderId(req, res) {
    try {
        const orderId = Number(req.params.orderId);

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({ error: "Order ID must be a positive integer", });
        }

        const payment = await paymentModel.getPaymentByOrderId(orderId, req.user);

        if (!payment) {
            return res.status(404).json({
                error: "Payment not found for this order",
            });
        }

        return res.status(200).json(payment);

    } catch (error) {
        console.error("Controller error (getPaymentByOrderId):", error);
        return res.status(500).json({
            error: "Error retrieving payment by order ID",
        });
    }
}

// Creates a payment request by delegating all payment processing and business rules to the model layer
// The controller is responsible for translating business exceptions into appropriate HTTP responses
async function createPayment(req, res) {
    try {
        const paymentData = { ...req.body };

        if (paymentData.AccountRegistration) {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(paymentData.AccountRegistration.Password, salt);

            paymentData.AccountRegistration.PasswordHash = passwordHash;
            delete paymentData.AccountRegistration.Password;
        }

        const newPayment = await paymentModel.createPayment(paymentData, req.user);

        if (
            newPayment.AccountCreated && newPayment.Account
        ) {
            const payload = {
                id: newPayment.Account.UserID,
                username: newPayment.Account.Username,
                email: newPayment.Account.Email,
                role: newPayment.Account.Role,
            };

            const token = jwt.sign(payload, process.env.JWT_SECRET, {
                expiresIn: "3600s",
            }
            );

            return res.status(201).json({
                message: "Payment created and account registered successfully",
                ...newPayment,
                token,
            });
        }

        return res.status(201).json(newPayment);
    } catch (error) {
        console.error("Controller error (createPayment):", error);

        if (
            error.message === "Guest order reference is required for guest checkout" ||
            error.message === "Account registration is only available for guest checkout" ||
            error.message === "Guest email is required to create an account"
        ) {
            return res.status(400).json({
                error: error.message,
            });
        }

        if (
            error.message === "Only customers can create payments"
        ) {
            return res.status(403).json({
                error: error.message,
            });
        }

        if (
            error.message === "Order does not exist or you do not have access to this order"
        ) {
            return res.status(404).json({
                error: error.message,
            });
        }

        if (
            error.message === "Payment can only be made for a pending order" ||
            error.message === "Payment has already been made for this order" ||
            error.message === "Transaction reference has already been used" ||
            error.message === "Username is already registered" ||
            error.message === "Email is already registered" ||
            error.message === "Only guest orders can be linked to a new account" ||
            error.message === "Guest order could not be linked to the new account"
        ) {
            return res.status(409).json({
                error: error.message,
            });
        }

        return res.status(500).json({
            error: "Error creating payment",
        });
    }
}

// Updates the lifecycle status of a payment
// Business rules such as valid status transitions and vendor ownership are enforced by the model layer
async function updatePaymentStatus(req, res) {
    try {
        const paymentId = Number(req.params.id);

        const updatedPayment = await paymentModel.updatePaymentStatus(
            paymentId,
            req.body.PaymentStatus,
            req.user
        );

        if (!updatedPayment) {
            return res.status(404).json({
                error: "Payment not found",
            });
        }

        return res.status(200).json(updatedPayment);
    } catch (error) {
        console.error("Controller error (updatePaymentStatus):", error);

        if (
            error.message.startsWith(
                "Payment status cannot be changed"
            )
        ) {
            return res.status(409).json({
                error: error.message,
            });
        }

        return res.status(500).json({
            error: "Failed to update payment status",
        });
    }
}

// Changes the payment method for an eligible pending payment.
// Ownership and payment-state rules are enforced by the model.
async function updatePaymentMethod(req, res) {
    try {
        const paymentId = Number(req.params.id);

        const updatedPayment = await paymentModel.updatePaymentMethod(
            paymentId,
            req.body,
            req.user
        );

        if (!updatedPayment) {
            return res.status(404).json({
                error: "Payment not found or access denied",
            });
        }

        return res.status(200).json(
            updatedPayment
        );
    } catch (error) {
        console.error(
            "Controller error (updatePaymentMethod):",
            error
        );

        if (
            error.message === "Payment method can only be changed while the order is pending" ||
            error.message === "Only pending or failed payments can change payment method" ||
            error.message === "Transaction reference has already been used"
        ) {
            return res.status(409).json({
                error: error.message,
            });
        }

        return res.status(500).json({
            error: "Failed to update payment method",
        });
    }
}

// Deletes an eligible payment record.
// The model validates ownership, payment status and order status before any database changes occur.
async function deletePayment(req, res) {
    try {
        const paymentId = Number(req.params.id);

        const deleted = await paymentModel.deletePayment(paymentId, req.user);

        if (!deleted) {
            return res.status(404).json({
                error: "Payment not found",
            });
        }

        return res.status(204).send();
    } catch (error) {
        console.error("Controller error (deletePayment):", error);

        if (
            error.message === "Successful or refunded payments cannot be deleted" ||
            error.message === "Payments can only be deleted for pending orders"
        ) {
            return res.status(409).json({
                error: error.message,
            });
        }

        return res.status(500).json({
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
    updatePaymentMethod,
    deletePayment,
};