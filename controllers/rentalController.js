// Rental Controller - Handles HTTP requests for stall rental agreements
const rentalModel = require("../models/rentalModel");

function isNeaOfficer(user) {
    return user.role === "nea_officer";
}

// Retrieve rental agreements
// NEA officer : every agreement
// Vendor      : only the agreements of their own account
async function getAgreements(req, res) {
    try {
        const agreements = await rentalModel.getAgreements({
            vendorUserId: isNeaOfficer(req.user) ? null : Number(req.user.id),
            status: req.agreementStatus,
        });

        return res.status(200).json({
            agreementCount: agreements.length,
            agreements,
        });
    } catch (error) {
        console.error("Controller error (getAgreements):", error);

        return res.status(500).json({
            error: "Unable to retrieve rental agreements",
        });
    }
}

// Retrieve the agreements that expire within the requested number of days
async function getExpiringAgreements(req, res) {
    try {
        const agreements = await rentalModel.getExpiringAgreements(
            req.expiryWindow
        );

        return res.status(200).json({
            days: req.expiryWindow,
            agreementCount: agreements.length,
            agreements,
        });
    } catch (error) {
        console.error("Controller error (getExpiringAgreements):", error);

        return res.status(500).json({
            error: "Unable to retrieve expiring rental agreements",
        });
    }
}

// Retrieve one agreement, which a vendor may only read for their own stall
async function getAgreementById(req, res) {
    try {
        const agreement = await rentalModel.getAgreementById(
            Number(req.params.id)
        );

        if (!agreement) {
            return res.status(404).json({
                error: "Rental agreement not found",
            });
        }

        if (
            !isNeaOfficer(req.user) &&
            Number(agreement.VendorUserID) !== Number(req.user.id)
        ) {
            return res.status(403).json({
                error: "You can only view your own rental agreements",
            });
        }

        return res.status(200).json(agreement);
    } catch (error) {
        console.error("Controller error (getAgreementById):", error);

        return res.status(500).json({
            error: "Unable to retrieve the rental agreement",
        });
    }
}

// Create a rental agreement between a stall and a vendor
async function createAgreement(req, res) {
    try {
        const stall = await rentalModel.getStallById(req.body.StallID);

        if (!stall) {
            return res.status(404).json({ error: "Food stall not found" });
        }

        const vendor = await rentalModel.getVendorById(req.body.VendorUserID);

        if (!vendor) {
            return res.status(404).json({ error: "Vendor account not found" });
        }

        // Only a vendor account can hold a stall tenancy
        if (vendor.Role !== "vendor") {
            return res.status(400).json({
                error: "The selected account is not a vendor account",
            });
        }

        // A stall cannot be rented to two vendors over the same period
        const overlapping = await rentalModel.findOverlappingAgreement(
            req.body.StallID,
            req.body.StartDate,
            req.body.EndDate
        );

        if (overlapping) {
            return res.status(409).json({
                error:
                    `This stall is already rented to ${overlapping.VendorName} between ` +
                    `${new Date(overlapping.StartDate).toISOString().slice(0, 10)} and ` +
                    `${new Date(overlapping.EndDate).toISOString().slice(0, 10)}`,
            });
        }

        const agreementId = await rentalModel.createAgreement(req.body);
        const agreement = await rentalModel.getAgreementById(agreementId);

        return res.status(201).json({
            message: "Rental agreement created successfully",
            agreement,
        });
    } catch (error) {
        console.error("Controller error (createAgreement):", error);

        return res.status(500).json({
            error: "Unable to create the rental agreement",
        });
    }
}

// Extend an existing agreement to a later end date
async function renewAgreement(req, res) {
    try {
        const agreementId = Number(req.params.id);

        const agreement = await rentalModel.getAgreementById(agreementId);

        if (!agreement) {
            return res.status(404).json({
                error: "Rental agreement not found",
            });
        }

        // A renewal always moves the end date forward
        if (new Date(req.body.EndDate) <= new Date(agreement.EndDate)) {
            return res.status(409).json({
                error:
                    "The new end date must be later than the current end date of " +
                    new Date(agreement.EndDate).toISOString().slice(0, 10),
            });
        }

        // The extended period must stay clear of any other tenancy of the stall
        const overlapping = await rentalModel.findOverlappingAgreement(
            agreement.StallID,
            agreement.StartDate,
            req.body.EndDate,
            agreementId
        );

        if (overlapping) {
            return res.status(409).json({
                error:
                    `The renewal overlaps the agreement of ${overlapping.VendorName} ` +
                    `that ends on ${new Date(overlapping.EndDate).toISOString().slice(0, 10)}`,
            });
        }

        await rentalModel.renewAgreement(
            agreementId,
            req.body.EndDate,
            req.body.RentalPrice
        );

        const renewed = await rentalModel.getAgreementById(agreementId);

        return res.status(200).json({
            message: "Rental agreement renewed successfully",
            agreement: renewed,
        });
    } catch (error) {
        console.error("Controller error (renewAgreement):", error);

        return res.status(500).json({
            error: "Unable to renew the rental agreement",
        });
    }
}

module.exports = {
    getAgreements,
    getExpiringAgreements,
    getAgreementById,
    createAgreement,
    renewAgreement,
};
