const Joi = require("joi"); // Import Joi for validation

/*
 * Validation for the inbox. Nothing is written through these routes beyond a
 * read receipt, so what has to be checked is the notification named in the URL
 * and the one optional filter the list accepts.
 */

// Middleware to validate the notification ID from URL parameters
function validateNotificationId(req, res, next) {
    const id = Number(req.params.notificationId);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "Invalid notification ID. ID must be a positive number",
        });
    }

    next();
}

// Middleware to validate the optional unread filter used when listing
function validateNotificationQuery(req, res, next) {
    const { error, value } = Joi.object({
        unread: Joi.boolean().messages({
            "boolean.base": "unread must be true or false",
        }),
    })
        .validate(req.query, { abortEarly: false });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage });
    }

    req.unreadOnly = value.unread === true;
    next();
}

module.exports = {
    validateNotificationId,
    validateNotificationQuery,
};
