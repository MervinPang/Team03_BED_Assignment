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