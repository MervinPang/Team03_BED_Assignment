const Joi = require("joi"); // Import Joi for validation

// Validation schema for submitting a complaint
// Validation schema for creating a complaint

const complaintSchema = Joi.object({
    stall_id: Joi.number().integer().positive().required().messages({
        "number.base": "stall_id must be a number",
        "number.integer": "stall_id must be an integer",
        "number.positive": "stall_id must be a positive number",
        "any.required": "stall_id is required",
    }),

    complaint_title: Joi.string().trim().required().messages({
        "string.base": "complaint_title must be a string",
        "string.empty": "complaint_title is required and cannot be empty",
        "any.required": "complaint_title is required",
    }),

    complaint_desc: Joi.string().trim().required().messages({
        "string.base": "complaint_desc must be a string",
        "string.empty": "complaint_desc is required and cannot be empty",
        "any.required": "complaint_desc is required",
    }),
});

// Validation schema for updating complaint status
const complaintStatusSchema = Joi.object({
    status: Joi.string()
        .valid("Pending", "In Review", "Resolved")
        .required()
        .messages({
            "any.only":
                "status must be one of: Pending, In Review, Resolved",
            "any.required": "status is required",
            "string.empty": "status is required",
        }),
});

// Middleware to validate complaint creation
function validateComplaint(req, res, next) {
    const { error, value } = complaintSchema.validate(req.body, {
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

// Middleware to validate complaint status update
function validateComplaintStatus(req, res, next) {
    const { error, value } = complaintStatusSchema.validate(req.body, {
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

module.exports = {
    validateComplaint,
    validateComplaintStatus,
};