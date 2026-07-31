const Joi = require("joi"); // Import Joi for validation

// Ended means the operator closed the tenancy before its agreed end date
const AGREEMENT_STATUSES = ["Active", "Upcoming", "Expired", "Ended"];

// Where a set of proposed terms has got to between the operator and the vendor
const OFFER_STATUSES = [
    "Pending Signature",
    "Signed",
    "Rejected",
    "Withdrawn",
];

// Validation schema for creating a rental agreement
const agreementSchema = Joi.object({
    StallID: Joi.number().integer().positive().required().messages({
        "number.base": "StallID must be a number",
        "number.integer": "StallID must be an integer",
        "number.positive": "StallID must be a positive number",
        "any.required": "StallID is required",
    }),

    VendorUserID: Joi.number().integer().positive().required().messages({
        "number.base": "VendorUserID must be a number",
        "number.integer": "VendorUserID must be an integer",
        "number.positive": "VendorUserID must be a positive number",
        "any.required": "VendorUserID is required",
    }),

    StartDate: Joi.date().iso().required().messages({
        "date.base": "Start date must be a valid date",
        "date.format": "Start date must use the YYYY-MM-DD format",
        "any.required": "Start date is required",
    }),

    // A tenancy always ends after it begins
    EndDate: Joi.date().iso().greater(Joi.ref("StartDate")).required().messages({
        "date.base": "End date must be a valid date",
        "date.format": "End date must use the YYYY-MM-DD format",
        "date.greater": "End date must be later than the start date",
        "any.required": "End date is required",
    }),

    // The database stores the rental price as DECIMAL(8,2)
    RentalPrice: Joi.number().min(0.01).max(999999.99).precision(2).required().messages({
        "number.base": "Rental price must be a number",
        "number.min": "Rental price must be at least 0.01",
        "number.max": "Rental price cannot exceed 999999.99",
        "any.required": "Rental price is required",
    }),

    TermCondition: Joi.string().trim().max(800).allow(null, "").messages({
        "string.base": "Terms and conditions must be a string",
        "string.max": "Terms and conditions cannot exceed 800 characters",
    }),
});

/*
 * Validation schema for renewing an agreement. A renewal is put to the vendor
 * rather than applied, so the note is what the operator says to explain terms
 * the vendor is being asked to accept.
 */
const renewalSchema = Joi.object({
    EndDate: Joi.date().iso().required().messages({
        "date.base": "End date must be a valid date",
        "date.format": "End date must use the YYYY-MM-DD format",
        "any.required": "End date is required",
    }),

    RentalPrice: Joi.number().min(0.01).max(999999.99).precision(2).messages({
        "number.base": "Rental price must be a number",
        "number.min": "Rental price must be at least 0.01",
        "number.max": "Rental price cannot exceed 999999.99",
    }),

    OfferNote: Joi.string().trim().max(500).allow(null, "").messages({
        "string.base": "The note to the vendor must be text",
        "string.max": "The note to the vendor cannot exceed 500 characters",
    }),
});

/*
 * Validation schema for signing an offer.
 *
 * Agree has to be sent as true rather than merely being absent, so accepting
 * new terms is always something the vendor did on purpose and never something
 * an empty request body could do on their behalf.
 */
const offerSignatureSchema = Joi.object({
    SignatureName: Joi.string().trim().min(2).max(80).required().messages({
        "string.base": "The signature must be text",
        "string.empty": "Type your account name to sign the offer",
        "string.min": "The signature must be at least 2 characters",
        "string.max": "The signature cannot exceed 80 characters",
        "any.required": "Type your account name to sign the offer",
    }),

    Agree: Joi.boolean().valid(true).required().messages({
        "any.only": "You must confirm that you agree to the proposed terms",
        "any.required": "You must confirm that you agree to the proposed terms",
    }),
});

// Validation schema for turning an offer down
const offerRejectionSchema = Joi.object({
    ResponseNote: Joi.string().trim().max(300).allow(null, "").messages({
        "string.base": "The reason must be text",
        "string.max": "The reason cannot exceed 300 characters",
    }),
});

/*
 * Validation schema for ending a tenancy. The end date may be left out, in
 * which case the tenancy closes today, which is what a handover normally means.
 */
const tenancyEndSchema = Joi.object({
    EndDate: Joi.date().iso().messages({
        "date.base": "End date must be a valid date",
        "date.format": "End date must use the YYYY-MM-DD format",
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

// Middleware to validate the optional status filter used when listing
function validateAgreementQuery(req, res, next) {
    const status = req.query.status;

    if (status !== undefined && !AGREEMENT_STATUSES.includes(status)) {
        return res.status(400).json({
            error: "Invalid status. Use Active, Upcoming or Expired",
        });
    }

    req.agreementStatus = status || null;
    next();
}

// Middleware to validate the number of days used by the expiry report
function validateExpiryWindow(req, res, next) {
    const days = req.query.days === undefined ? 30 : Number(req.query.days);

    if (!Number.isInteger(days) || days < 1 || days > 365) {
        return res.status(400).json({
            error: "Days must be a whole number between 1 and 365",
        });
    }

    req.expiryWindow = days;
    next();
}

// Middleware to validate the agreement ID from URL parameters
function validateAgreementId(req, res, next) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "Invalid agreement ID. ID must be a positive number",
        });
    }

    next();
}

// Middleware to validate the offer ID from URL parameters
function validateOfferId(req, res, next) {
    const id = Number(req.params.offerId);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "Invalid offer ID. ID must be a positive number",
        });
    }

    next();
}

// Middleware to validate the optional status filter used when listing offers
function validateOfferQuery(req, res, next) {
    const status = req.query.status;

    if (status !== undefined && !OFFER_STATUSES.includes(status)) {
        return res.status(400).json({
            error:
                "Invalid status. Use " + OFFER_STATUSES.join(", "),
        });
    }

    req.offerStatus = status || null;
    next();
}

module.exports = {
    validateAgreement: validateWith(agreementSchema),
    validateRenewal: validateWith(renewalSchema),
    validateTenancyEnd: validateWith(tenancyEndSchema),
    validateOfferSignature: validateWith(offerSignatureSchema),
    validateOfferRejection: validateWith(offerRejectionSchema),
    validateAgreementQuery,
    validateExpiryWindow,
    validateAgreementId,
    validateOfferId,
    validateOfferQuery,
};
