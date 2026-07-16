const Joi = require("joi"); // Import Joi for validation

// Validation schema for submitting/updating feedback
const feedbackSchema = Joi.object({
    StallID: Joi.number().integer().positive().required().messages({
        "number.base": "StallID must be a number",
        "number.integer": "StallID must be an integer",
        "number.positive": "StallID must be a positive number",
        "any.required": "StallID is required",
    }),

    Rating: Joi.number().integer().min(1).max(5).required().messages({
        "number.base": "Rating must be a number",
        "number.integer": "Rating must be an integer",
        "number.min": "Rating must be at least 1",
        "number.max": "Rating cannot exceed 5",
        "any.required": "Rating is required",
    }),

    ReviewComment: Joi.string().trim().max(500).allow(null, "").messages({
        "string.base": "Review comment must be a string",
        "string.max": "Review comment cannot exceed 500 characters",
    }),
});

// Middleware to validate feedback data for POST/PUT
function validateFeedback(req, res, next) {
    const { error, value } = feedbackSchema.validate(req.body, { abortEarly: false });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage });
    }

    req.body = value;
    next();
}

// Middleware to validate review ID from URL parameters
function validateReviewId(req, res, next) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "Invalid review ID. ID must be a positive number",
        });
    }

    next();
}

module.exports = {
    validateFeedback,
    validateReviewId,
};