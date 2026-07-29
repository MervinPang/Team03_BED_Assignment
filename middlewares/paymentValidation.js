const Joi = require("joi"); // Import Joi for validation

// Payment Validation - Validates Checkout and Payment requests

// Validation schema for optional guest account registration
const accountRegistrationSchema = Joi.object({
    Username: Joi.string().trim().min(3).max(50).required().messages({
        "string.base": "Username must be a string",
        "string.empty": "Username is required",
        "string.min": "Username must be at least 3 characters",
        "string.max": "Username cannot exceed 50 characters",
        "any.required": "Username is required",
    }),

    Password: Joi.string().min(8).max(100).required().messages({
        "string.base": "Password must be a string",
        "string.empty": "Password is required",
        "string.min": "Password must be at least 8 characters",
        "string.max": "Password cannot exceed 100 characters",
        "any.required": "Password is required",
    }),
}).unknown(false);

// Validation schema for checking whether guest account details
// are already registered before proceeding to payment
const accountAvailabilitySchema = Joi.object({
    Username: Joi.string().trim().min(3).max(50).required().messages({
        "string.base": "Username must be a string",
        "string.empty": "Username is required",
        "string.min": "Username must be at least 3 characters",
        "string.max": "Username cannot exceed 50 characters",
        "any.required": "Username is required",
    }),

    Email: Joi.string().trim().email().max(100).required().messages({
        "string.base": "Email must be a string",
        "string.empty": "Email is required",
        "string.email": "Email must be a valid email address",
        "string.max": "Email cannot exceed 100 characters",
        "any.required": "Email is required",
    }),
}).unknown(false);

// Validates payment requests before business logic executes
// Validation protects the application from malformed, incomplete and unexpected client input while ensuring
// required payment information is supplied
const paymentSchema = Joi.object({
    OrderID: Joi.number().integer().positive().required().messages({
        "number.base": "OrderID must be a number",
        "number.integer": "OrderID must be an integer",
        "number.positive": "OrderID must be a positive number",
        "any.required": "OrderID is required",
    }),

    GuestOrderReference: Joi.string().trim().min(10).max(50).optional().messages({
        "string.base": "Guest order reference must be a string",
        "string.empty": "Guest order reference cannot be empty",
        "string.min": "Guest order reference is invalid",
        "string.max": "Guest order reference cannot exceed 50 characters",
    }),

    PaymentMethod: Joi.string().valid("Cash", "Card", "PayNow").required().messages({
        "any.only": "Payment method must be Cash, Card or PayNow",
        "any.required": "Payment method is required",
        "string.base": "Payment method must be a string",
    }),

    TransactionReference: Joi.when("PaymentMethod", {
        is: "Cash",

        // Cash payments are completed physically at the stall, therefore an external transaction reference is optional
        then: Joi.string().trim().max(100).allow(null, "").optional().messages({
            "string.base": "Transaction reference must be a string",
            "string.max": "Transaction reference cannot exceed 100 characters",
        }),

        // Card and PayNow payments require a transaction reference
        // So each transaction can be uniquely identified
        otherwise: Joi.string().trim().max(100).required().messages({
            "string.base": "Transaction reference must be a string",
            "string.empty": "Transaction reference cannot be empty",
            "string.max": "Transaction reference cannot exceed 100 characters",
            "any.required": "Transaction reference is required for Card and PayNow payments",
        }),
    }),

    AccountRegistration: accountRegistrationSchema.allow(null).optional(),

    // Keep your TransactionReference validation
}).unknown(false);

// Validation schema for updating payment status
const paymentStatusSchema = Joi.object({
    PaymentStatus: Joi.string().valid("Pending", "Successful", "Failed", "Refunded").required().messages({
        "any.only": "Payment status must be Pending, Successful, Failed or Refunded",
        "any.required": "Payment status is required",
        "string.base": "Payment status must be a string",
    }),
}).unknown(false);

// Validation schema for changing an existing payment method
const paymentMethodUpdateSchema = Joi.object({
    PaymentMethod: Joi.string().valid("Cash", "Card", "PayNow").required().messages({
        "any.only": "Payment method must be Cash, Card or PayNow",
        "any.required": "Payment method is required",
        "string.base": "Payment method must be a string",
    }),

    GuestOrderReference: Joi.string().trim().min(10).max(50).optional().messages({
        "string.base": "Guest order reference must be a string",
        "string.empty": "Guest order reference cannot be empty",
        "string.min": "Guest order reference is invalid",
        "string.max": "Guest order reference cannot exceed 50 characters",
    }),

    TransactionReference: Joi.when(
        "PaymentMethod",
        {
            is: "Cash",

            then: Joi.string().trim().max(100).allow(null, "").optional().messages({
                "string.base": "Transaction reference must be a string",
                "string.max": "Transaction reference cannot exceed 100 characters",
            }),

            otherwise: Joi.string().trim().max(100).required().messages({
                "string.base": "Transaction reference must be a string",
                "string.empty": "Transaction reference cannot be empty",
                "string.max": "Transaction reference cannot exceed 100 characters",
                "any.required": "Transaction reference is required for Card and PayNow payments",
            }),
        }
    ),
}).unknown(false);

// Performs request validation before the controller executes,
// ensuring only well-formed payment requests reach the model layer
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

// Validates guest account details before checking the database
function validateAccountAvailability(req, res, next) {
    const { error, value } =
        accountAvailabilitySchema.validate(req.body, {
            abortEarly: false,
        });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage, });
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

// Validates requests that change an existing payment method
function validatePaymentMethodUpdate(req, res, next) {
    const { error, value } =
        paymentMethodUpdateSchema.validate(
            req.body,
            {
                abortEarly: false,
            }
        );

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({
            error: errorMessage,
        });
    }

    req.body = value;
    next();
}

// Ensures the PaymentID route parameter is a valid
// positive integer before querying the database
function validatePaymentId(req, res, next) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "Invalid payment ID. ID must be a positive number",
        });
    }

    next();
}

// Validates OrderID supplied in the request URL, preventing invalid database queries
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
    validateAccountAvailability,
    validatePaymentStatus,
    validatePaymentMethodUpdate,
    validatePaymentId,
    validateOrderIdParam,
};