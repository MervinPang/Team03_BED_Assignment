const Joi = require("joi");

// Validation schema for registered customer order ID
const orderHistoryIdSchema = Joi.object({
    id: Joi.number().integer().positive().required().messages({
            "number.base": "Order ID must be a number",
            "number.integer": "Order ID must be an integer",
            "number.positive": "Order ID must be a positive number",
            "any.required": "Order ID is required",
        }),
}).unknown(false);

// Validation schema for guest order history
const guestOrderHistorySchema = Joi.object({
    OrderID: Joi.number().integer().positive().required().messages({
            "number.base": "Order ID must be a number",
            "number.integer": "Order ID must be an integer",
            "number.positive": "Order ID must be a positive number",
            "any.required": "Order ID is required",
        }),

    GuestOrderReference: Joi.string().trim().min(10).max(50).required().messages({
            "string.base": "Guest order reference must be a string",
            "string.empty": "Guest order reference cannot be empty",
            "string.min": "Guest order reference is invalid",
            "string.max": "Guest order reference cannot exceed 50 characters",
            "any.required": "Guest order reference is required",
        }),
}).unknown(false);

// Validate order ID from URL parameter
function validateOrderHistoryId(req, res, next) {
    const { error, value } = orderHistoryIdSchema.validate(
        req.params,
        {
            abortEarly: false,
            convert: true,
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

    req.params = value;
    next();
}

// Validate guest order history request body
function validateGuestOrderHistory(req, res, next) {
    const { error, value } =
        guestOrderHistorySchema.validate(req.body, {
            abortEarly: false,
        });

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

module.exports = {
    validateOrderHistoryId,
    validateGuestOrderHistory,
};