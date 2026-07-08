const Joi = require("joi"); // Import Joi for validation

// Validation design for user registration
const registerSchema = Joi.object({
    Username: Joi.string().trim().min(3).max(50).required().messages({
        "string.base": "Username must be a string",
        "string.empty": "Username cannot be empty",
        "string.min": "Username must be at least 3 characters long",
        "string.max": "Username cannot exceed 50 characters",
        "any.required": "Username is required",
    }),

    Email: Joi.string().trim().email().max(100).required().messages({
        "string.base": "Email must be a string",
        "string.empty": "Email cannot be empty",
        "string.email": "Email must be a valid email address",
        "string.max": "Email cannot exceed 100 characters",
        "any.required": "Email is required",
    }),

    Password: Joi.string()
        .min(8)
        .max(50)
        .pattern(/^(?=.*[a-zA-Z])(?=.*[0-9])/)
        .required()
        .messages({
            "string.base": "Password must be a string",
            "string.empty": "Password cannot be empty",
            "string.min": "Password must be at least 8 characters long",
            "string.max": "Password cannot exceed 50 characters",
            "string.pattern.base": "Password must contain at least one letter and one number",
            "any.required": "Password is required",
        }),

    Role: Joi.string().valid("customer", "vendor", "nea_officer").required().messages({
        "any.only": "Role must be customer, vendor or nea_officer",
        "any.required": "Role is required",
        "string.base": "Role must be a string",
    }),
});

// Validation design for user login
const loginSchema = Joi.object({
    Email: Joi.string().trim().email().required().messages({
        "string.base": "Email must be a string",
        "string.empty": "Email cannot be empty",
        "string.email": "Email must be a valid email address",
        "any.required": "Email is required",
    }),

    Password: Joi.string().required().messages({
        "string.base": "Password must be a string",
        "string.empty": "Password cannot be empty",
        "any.required": "Password is required",
    }),
});

// Middleware to validate registration data for POST /register
function validateRegistration(req, res, next) {
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage });
    }

    req.body = value;
    next();
}

// Middleware to validate login data for POST /login
function validateLogin(req, res, next) {
    const { error, value } = loginSchema.validate(req.body, { abortEarly: false });

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
    validateRegistration,
    validateLogin,
};