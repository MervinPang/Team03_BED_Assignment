const Joi = require("joi"); // Import Joi for validation

// Validation schema for a vendor's reply to a customer review
const replySchema = Joi.object({
    ReplyText: Joi.string().trim().min(2).max(500).required().messages({
        "string.base": "The reply must be text",
        "string.empty": "The reply cannot be empty",
        "string.min": "The reply must be at least 2 characters",
        "string.max": "The reply cannot exceed 500 characters",
        "any.required": "The reply is required",
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

// Middleware to validate the review ID from URL parameters
function validateReplyReviewId(req, res, next) {
    const id = Number(req.params.reviewId);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "Invalid review ID. ID must be a positive number",
        });
    }

    next();
}

module.exports = {
    validateReply: validateWith(replySchema),
    validateReplyReviewId,
};
