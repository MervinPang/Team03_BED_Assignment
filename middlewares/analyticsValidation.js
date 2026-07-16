const Joi = require("joi"); // Import Joi for validation

// Validation schema for stallId URL parameter
const stallIdParamSchema = Joi.object({
    stallId: Joi.number().integer().positive().required().messages({
        "number.base": "stallId must be a number",
        "number.integer": "stallId must be an integer",
        "number.positive": "stallId must be a positive number",
        "any.required": "stallId is required",
    }),
});

// Middleware to validate stallId from URL parameters
function validateStallOwnership(req, res, next) {
    const { error, value } = stallIdParamSchema.validate(req.params, { abortEarly: false });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage });
    }

    req.params = value;
    next();
}

module.exports = {
    validateStallOwnership,
};