const Joi = require("joi"); // Import Joi for validation

// Validation schema for creating an order
const orderSchema = Joi.object({
    UserID: Joi.number().integer().positive().allow(null).messages({
        "number.base": "UserID must be a number",
        "number.integer": "UserID must be an integer",
        "number.positive": "UserID must be a positive number",
    }),

    GuestName: Joi.string().min(1).max(80).allow(null, "").messages({
        "string.base": "Guest name must be a string",
        "string.min": "Guest name must be at least 1 character long",
        "string.max": "Guest name cannot exceed 80 characters",
    }),

    GuestEmail: Joi.string().email().max(100).allow(null, "").messages({
        "string.base": "Guest email must be a string",
        "string.email": "Guest email must be a valid email address",
        "string.max": "Guest email cannot exceed 100 characters",
    }),

    OrderType: Joi.string().valid("Guest", "Member").required().messages({
        "any.only": "Order type must be either Guest or Member",
        "any.required": "Order type is required",
        "string.base": "Order type must be a string",
    }),

    SpecialInstructions: Joi.string().max(300).allow(null, "").messages({
        "string.base": "Special instructions must be a string",
        "string.max": "Special instructions cannot exceed 300 characters",
    }),

    items: Joi.array()
        .items(
            Joi.object({
                MenuItemID: Joi.number().integer().positive().required().messages({
                    "number.base": "MenuItemID must be a number",
                    "number.integer": "MenuItemID must be an integer",
                    "number.positive": "MenuItemID must be a positive number",
                    "any.required": "MenuItemID is required",
                }),

                Quantity: Joi.number().integer().min(1).required().messages({
                    "number.base": "Quantity must be a number",
                    "number.integer": "Quantity must be an integer",
                    "number.min": "Quantity must be at least 1",
                    "any.required": "Quantity is required",
                }),
            })
        )
        .min(1)
        .required()
        .messages({
            "array.base": "Items must be an array",
            "array.min": "Order must contain at least one item",
            "any.required": "Items are required",
        }),
});

// Validation schema for updating order status
const orderStatusSchema = Joi.object({
    OrderStatus: Joi.string()
        .valid("Pending", "Preparing", "Ready", "Completed", "Cancelled")
        .required()
        .messages({
            "any.only":
                "Order status must be Pending, Preparing, Ready, Completed or Cancelled",
            "any.required": "Order status is required",
            "string.base": "Order status must be a string",
        }),
});

// Middleware to validate order data for POST
function validateOrder(req, res, next) {
    const { error } = orderSchema.validate(req.body, { abortEarly: false });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage });
    }

    // Extra business rule for guest/member checkout
    if (req.body.OrderType === "Member" && !req.body.UserID) {
        return res.status(400).json({
            error: "UserID is required for member orders",
        });
    }

    if (
        req.body.OrderType === "Guest" &&
        (!req.body.GuestName || !req.body.GuestEmail)
    ) {
        return res.status(400).json({
            error: "Guest name and guest email are required for guest orders",
        });
    }

    next();
}

// Middleware to validate order status for PUT
function validateOrderStatus(req, res, next) {
    const { error } = orderStatusSchema.validate(req.body, {
        abortEarly: false,
    });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage });
    }

    next();
}

// Middleware to validate order ID from URL parameters
function validateOrderId(req, res, next) {
    const id = parseInt(req.params.id);

    if (isNaN(id) || id <= 0) {
        return res.status(400).json({
            error: "Invalid order ID. ID must be a positive number",
        });
    }

    next();
}

module.exports = {
    validateOrder,
    validateOrderStatus,
    validateOrderId,
};