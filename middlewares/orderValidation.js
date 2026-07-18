const Joi = require("joi"); // Import Joi for validation

// Validation schema for creating an order
const orderSchema = Joi.object({
    OrderType: Joi.string().valid("Guest", "Member").required().messages({
        "any.only": "Order type must be either Guest or Member",
        "any.required": "Order type is required",
        "string.base": "Order type must be a string",
    }),

    GuestName: Joi.when("OrderType", {
        is: "Guest", then: Joi.string().trim().min(1).max(80).required().messages({
            "string.base": "Guest name must be a string",
            "string.empty": "Guest name cannot be empty",
            "string.min": "Guest name must contain at least 1 character",
            "string.max": "Guest name cannot exceed 80 characters",
            "any.required": "Guest name is required for guest orders",
        }),

        otherwise: Joi.forbidden().messages({
            "any.unknown": "GuestName is not allowed for member orders",
        }),
    }),

    GuestEmail: Joi.when("OrderType", {
        is: "Guest", then: Joi.string().trim().email().max(100).required().messages({
            "string.base": "Guest email must be a string",
            "string.empty": "Guest email cannot be empty",
            "string.email": "Guest email must be a valid email address",
            "string.max": "Guest email cannot exceed 100 characters",
            "any.required": "Guest email is required for guest orders",
        }),

        otherwise: Joi.forbidden().messages({
            "any.unknown": "GuestEmail is not allowed for member orders",
        }),
    }),

    SpecialInstructions: Joi.string().trim().max(300).allow(null, "").messages({
        "string.base": "Special instructions must be a string",
        "string.max": "Special instructions cannot exceed 300 characters",
    }),

    items: Joi.array().items(
        Joi.object({
            MenuItemID: Joi.number().integer().positive().required().messages({
                "number.base": "MenuItemID must be a number",
                "number.integer": "MenuItemID must be an integer",
                "number.positive": "MenuItemID must be a positive number",
                "any.required": "MenuItemID is required",
            }),

            Quantity: Joi.number().integer().min(1).max(50).required().messages({
                "number.base": "Quantity must be a number",
                "number.integer": "Quantity must be an integer",
                "number.min": "Quantity must be at least 1",
                "number.max": "Quantity cannot exceed 50 per menu item",
                "any.required": "Quantity is required",
            }),
        }).unknown(false)
    )
        .min(1)
        .required()
        .messages({
            "array.base": "Items must be an array",
            "array.min": "Order must contain at least one item",
            "any.required": "Items are required",
        }),
}).unknown(false);

// Validation schema for updating order status
const orderStatusSchema = Joi.object({
    OrderStatus: Joi.string().valid("Pending", "Preparing", "Ready", "Completed", "Cancelled").required().messages({
        "any.only": "Order status must be Pending, Preparing, Ready, Completed or Cancelled",
        "any.required": "Order status is required",
        "string.base": "Order status must be a string",
    }),
}).unknown(false);

// Middleware to validate order data for POST
function validateOrder(req, res, next) {
    const { error, value } = orderSchema.validate(req.body, { abortEarly: false });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage });
    }

    // Check for duplicate menu items
    const menuItemIds = value.items.map((item) => item.MenuItemID);
    const hasDuplicates = new Set(menuItemIds).size !== menuItemIds.length;

    if (hasDuplicates) {
        return res.status(400).json({
            error: "Duplicate menu items are not allowed. Please update the quantity instead.",
        });
    }

    req.body = value;
    next();
}

// Middleware to validate order status for PUT
function validateOrderStatus(req, res, next) {
    const { error, value } = orderStatusSchema.validate(req.body, {
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

// Middleware to validate order ID from URL parameters
function validateOrderId(req, res, next) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
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