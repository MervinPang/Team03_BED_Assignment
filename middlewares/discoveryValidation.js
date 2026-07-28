const Joi = require("joi"); // Import Joi for validation

const ALLOWED_GRADES = ["A", "B", "C", "D"];
const ALLOWED_SORTS = ["name", "price_asc", "price_desc", "grade"];

// Validation schema for the stall search query string
// Every filter is optional so an unfiltered search is still valid
const stallSearchSchema = Joi.object({
    area: Joi.string().trim().max(50).allow("").messages({
        "string.base": "Area must be a string",
        "string.max": "Area cannot exceed 50 characters",
    }),

    hawkerCentreId: Joi.number().integer().positive().messages({
        "number.base": "Hawker centre ID must be a number",
        "number.integer": "Hawker centre ID must be an integer",
        "number.positive": "Hawker centre ID must be a positive number",
    }),

    // Accepts a single grade or a comma separated list such as A,B
    grades: Joi.string()
        .trim()
        .uppercase()
        .pattern(/^[ABCD](\s*,\s*[ABCD])*$/i)
        .allow("")
        .messages({
            "string.pattern.base":
                "Hygiene grade must be A, B, C or D, separated by commas",
        }),

    minPrice: Joi.number().min(0).max(999.99).precision(2).messages({
        "number.base": "Minimum price must be a number",
        "number.min": "Minimum price cannot be negative",
        "number.max": "Minimum price cannot exceed 999.99",
        "number.precision": "Minimum price cannot have more than 2 decimal places",
    }),

    maxPrice: Joi.number().min(0).max(999.99).precision(2).messages({
        "number.base": "Maximum price must be a number",
        "number.min": "Maximum price cannot be negative",
        "number.max": "Maximum price cannot exceed 999.99",
        "number.precision": "Maximum price cannot have more than 2 decimal places",
    }),

    sort: Joi.string()
        .trim()
        .lowercase()
        .valid(...ALLOWED_SORTS)
        .messages({
            "any.only":
                "Invalid sort option. Use name, price_asc, price_desc or grade",
        }),
});

// Middleware to validate the stall search filters supplied in the query string
function validateStallSearch(req, res, next) {
    const { error, value } = stallSearchSchema.validate(req.query, {
        abortEarly: false,
    });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(", ");

        return res.status(400).json({ error: errorMessage });
    }

    // A range is only meaningful when the lower bound is not above the upper bound
    if (
        value.minPrice !== undefined &&
        value.maxPrice !== undefined &&
        value.minPrice > value.maxPrice
    ) {
        return res.status(400).json({
            error: "Maximum price cannot be lower than minimum price",
        });
    }

    // Duplicate grades are removed so the same stall cannot be matched twice
    const grades = value.grades
        ? [
            ...new Set(
                value.grades
                    .split(",")
                    .map((grade) => grade.trim().toUpperCase())
            ),
        ].filter((grade) => ALLOWED_GRADES.includes(grade))
        : null;

    req.searchFilters = {
        area: value.area || null,
        hawkerCentreId: value.hawkerCentreId || null,
        grades: grades && grades.length ? grades : null,
        minPrice: value.minPrice,
        maxPrice: value.maxPrice,
        sort: value.sort || "name",
    };

    next();
}

// Middleware to validate the area supplied when listing hawker centres
function validateAreaQuery(req, res, next) {
    const area = req.query.area;

    if (area !== undefined && typeof area !== "string") {
        return res.status(400).json({ error: "Area must be a string" });
    }

    if (typeof area === "string" && area.trim().length > 50) {
        return res.status(400).json({
            error: "Area cannot exceed 50 characters",
        });
    }

    req.searchArea = typeof area === "string" ? area.trim() : null;
    next();
}

// Middleware to validate the hawker centre ID from URL parameters
function validateHawkerCentreId(req, res, next) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "Invalid hawker centre ID. ID must be a positive number",
        });
    }

    next();
}

module.exports = {
    validateStallSearch,
    validateAreaQuery,
    validateHawkerCentreId,
};