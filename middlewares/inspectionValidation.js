const Joi = require("joi"); // Import Joi for validation

// Validation schema for submitting an inspection report
const inspectionSchema = Joi.object({
    stall_id: Joi.number().integer().positive().required().messages({
        "number.base": "stall_id must be a number",
        "number.integer": "stall_id must be an integer",
        "number.positive": "stall_id must be a positive number",
        "any.required": "stall_id is required",
    }),

    score: Joi.number().min(0).max(100).required().messages({
        "number.base": "score must be a number",
        "number.min": "score must be at least 0",
        "number.max": "score cannot exceed 100",
        "any.required": "score is required",
    }),

    remarks: Joi.string().trim().max(500).allow(null, "").messages({
        "string.base": "remarks must be a string",
        "string.max": "remarks cannot exceed 500 characters",
    }),
});

// Middleware to validate inspection data for POST
function validateInspection(req, res, next) {
    const { error, value } = inspectionSchema.validate(req.body, { abortEarly: false });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage });
    }

    req.body = value;
    next();
}

module.exports = {
    validateInspection,
};