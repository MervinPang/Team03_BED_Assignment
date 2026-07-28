const Joi = require("joi"); // Import Joi for validation
const vendorMenuModel = require("../models/vendorMenuModel");

// Validation schema for creating and updating a menu item
const menuItemSchema = Joi.object({
    ItemName: Joi.string().trim().min(2).max(100).required().messages({
        "string.base": "Item name must be a string",
        "string.empty": "Item name is required",
        "string.min": "Item name must be at least 2 characters",
        "string.max": "Item name cannot exceed 100 characters",
        "any.required": "Item name is required",
    }),

    ItemDesc: Joi.string().trim().max(300).allow(null, "").messages({
        "string.base": "Item description must be a string",
        "string.max": "Item description cannot exceed 300 characters",
    }),

    // The database stores prices as DECIMAL(6,2) with a minimum of 0.01
    ItemPrice: Joi.number().min(0.01).max(9999.99).precision(2).required().messages({
        "number.base": "Item price must be a number",
        "number.min": "Item price must be at least 0.01",
        "number.max": "Item price cannot exceed 9999.99",
        "any.required": "Item price is required",
    }),

    ItemCategory: Joi.string().trim().max(40).required().messages({
        "string.base": "Item category must be a string",
        "string.empty": "Item category is required",
        "string.max": "Item category cannot exceed 40 characters",
        "any.required": "Item category is required",
    }),

    ItemImage: Joi.string().trim().max(255).allow(null, "").messages({
        "string.base": "Item image must be a string",
        "string.max": "Item image path cannot exceed 255 characters",
    }),

    IsAvailable: Joi.boolean().default(true).messages({
        "boolean.base": "Availability must be true or false",
    }),
});

// Validation schema for the sold out toggle
const availabilitySchema = Joi.object({
    IsAvailable: Joi.boolean().required().messages({
        "boolean.base": "Availability must be true or false",
        "any.required": "Availability is required",
    }),
});

// Validation schema for the stall details a vendor may change
const stallUpdateSchema = Joi.object({
    StallName: Joi.string().trim().min(2).max(80).required().messages({
        "string.base": "Stall name must be a string",
        "string.empty": "Stall name is required",
        "string.min": "Stall name must be at least 2 characters",
        "string.max": "Stall name cannot exceed 80 characters",
        "any.required": "Stall name is required",
    }),

    StallDesc: Joi.string().trim().max(300).allow(null, "").messages({
        "string.base": "Stall description must be a string",
        "string.max": "Stall description cannot exceed 300 characters",
    }),

    StallImage: Joi.string().trim().max(255).allow(null, "").messages({
        "string.base": "Stall image must be a string",
        "string.max": "Stall image path cannot exceed 255 characters",
    }),

    // A stall that is not active is hidden from customers but keeps its data
    IsActive: Joi.boolean().default(true).messages({
        "boolean.base": "Stall availability must be true or false",
    }),
});

function validateWith(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
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
    };
}

/*
 * Confirms that the stall in the URL exists and belongs to the signed in
 * vendor. Ownership is checked here so that no route handler can forget it.
 */
async function requireStallOwnership(req, res, next) {
    try {
        const stallId = Number(req.params.stallId);

        if (!Number.isInteger(stallId) || stallId <= 0) {
            return res.status(400).json({
                error: "Invalid stall ID. ID must be a positive number",
            });
        }

        const stall = await vendorMenuModel.getStallOwner(stallId);

        if (!stall) {
            return res.status(404).json({ error: "Food stall not found" });
        }

        if (Number(stall.VendorUserID) !== Number(req.user.id)) {
            return res.status(403).json({
                error: "You can only manage a food stall assigned to your account",
            });
        }

        req.stall = stall;
        next();
    } catch (error) {
        console.error("Middleware error (requireStallOwnership):", error);

        return res.status(500).json({
            error: "Unable to verify stall ownership",
        });
    }
}

// Confirms that the menu item exists and belongs to the stall in the URL
async function requireMenuItemInStall(req, res, next) {
    try {
        const menuItemId = Number(req.params.itemId);

        if (!Number.isInteger(menuItemId) || menuItemId <= 0) {
            return res.status(400).json({
                error: "Invalid menu item ID. ID must be a positive number",
            });
        }

        const menuItem = await vendorMenuModel.getMenuItemById(menuItemId);

        if (
            !menuItem ||
            Number(menuItem.StallID) !== Number(req.params.stallId)
        ) {
            return res.status(404).json({
                error: "Menu item not found for this food stall",
            });
        }

        req.menuItem = menuItem;
        next();
    } catch (error) {
        console.error("Middleware error (requireMenuItemInStall):", error);

        return res.status(500).json({
            error: "Unable to verify the menu item",
        });
    }
}

module.exports = {
    validateMenuItem: validateWith(menuItemSchema),
    validateAvailability: validateWith(availabilitySchema),
    validateStallUpdate: validateWith(stallUpdateSchema),
    requireStallOwnership,
    requireMenuItemInStall,
};
