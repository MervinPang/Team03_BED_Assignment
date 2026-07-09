const Joi = require("joi"); // Import Joi for validation

// Payment Validation - Validates Checkout and Payment requests

// Validation schema for creating a payment
const paymentSchema = Joi.object({
    OrderID: Joi.number().integer().positive().required().messages({
        "number.base": "OrderID must be a number",
        "number.integer": "OrderID must be an integer",
        "number.positive": "OrderID must be a positive number",
        "any.required": "OrderID is required",
    }),

    PaymentMethod: Joi.string()
        .valid("Cash", "Card", "PayNow")
        .required()
        .messages({
            "any.only": "Payment method must be Cash, Card or PayNow",
            "any.required": "Payment method is required",
            "string.base": "Payment method must be a string",
        }),

    PaymentStatus: Joi.string()
        .valid("Pending", "Successful", "Failed", "Refunded")
        .optional()
        .messages({
            "any.only": "Payment status must be Pending, Successful, Failed or Refunded",
            "string.base": "Payment status must be a string",
        }),

    Amount: Joi.number().precision(2).min(0).required().messages({
        "number.base": "Amount must be a number",
        "number.min": "Amount cannot be negative",
        "any.required": "Amount is required",
    }),

    TransactionReference: Joi.string().trim().max(100).required().messages({
        "string.base": "Transaction reference must be a string",
        "string.empty": "Transaction reference cannot be empty",
        "string.max": "Transaction reference cannot exceed 100 characters",
        "any.required": "Transaction reference is required",
    }),
});

// Validation schema for updating payment status
const paymentStatusSchema = Joi.object({
    PaymentStatus: Joi.string()
        .valid("Pending", "Successful", "Failed", "Refunded")
        .required()
        .messages({
            "any.only": "Payment status must be Pending, Successful, Failed or Refunded",
            "any.required": "Payment status is required",
            "string.base": "Payment status must be a string",
        }),
});

// Middleware to validate payment data for POST
function validatePayment(req, res, next) {
    const { error, value } = paymentSchema.validate(req.body, {
        abortEarly: false,
    });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage });
    }

    req.body = value;
    next();
}

// Middleware to validate payment status for PUT
function validatePaymentStatus(req, res, next) {
    const { error, value } = paymentStatusSchema.validate(req.body, {
        abortEarly: false,
    });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage });
    }

    req.body = value;
    next();
}

// Middleware to validate PaymentID from URL parameters
function validatePaymentId(req, res, next) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "Invalid payment ID. ID must be a positive number",
        });
    }

    next();
}

// Middleware to validate OrderID from URL parameters
function validateOrderIdParam(req, res, next) {
    const orderId = Number(req.params.orderId);

    if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({
            error: "Invalid order ID. ID must be a positive number",
        });
    }

    next();
}

// Export validation middleware for use in app.js
module.exports = {
    validatePayment,
    validatePaymentStatus,
    validatePaymentId,
    validateOrderIdParam,
};