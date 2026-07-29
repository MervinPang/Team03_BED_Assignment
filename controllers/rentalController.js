// Rental Controller - Handles HTTP requests for stall rental agreements
const rentalModel = require("../models/rentalModel");

function isOperator(user) {
    return user.role === "operator";
}

/*
 * Resolve the operator a signed in account works for.
 *
 * Everything an operator is allowed to reach follows from this one value, so it
 * is read from the database rather than taken from the request. An operator
 * account with no operator attached is treated as having reached nothing.
 */
async function requireOperatorId(req, res) {
    const operator = await rentalModel.getOperatorIdForUser(
        Number(req.user.id)
    );

    if (!operator || !operator.OperatorID) {
        res.status(403).json({
            error: "Your account is not linked to a hawker centre operator",
        });

        return null;
    }

    return Number(operator.OperatorID);
}

// Retrieve rental agreements
// Operator : the stalls inside the hawker centres they run
// Vendor   : only the agreements of their own account
async function getAgreements(req, res) {
    try {
        let operatorId = null;

        if (isOperator(req.user)) {
            operatorId = await requireOperatorId(req, res);

            if (operatorId === null) return;
        }

        const agreements = await rentalModel.getAgreements({
            vendorUserId: isOperator(req.user) ? null : Number(req.user.id),
            operatorId,
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
        const operatorId = await requireOperatorId(req, res);

        if (operatorId === null) return;

        const agreements = await rentalModel.getExpiringAgreements(
            req.expiryWindow,
            operatorId
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

// Retrieve the stalls the signed in operator is responsible for
async function getManagedStalls(req, res) {
    try {
        const operatorId = await requireOperatorId(req, res);

        if (operatorId === null) return;

        const stalls = await rentalModel.getManagedStalls(operatorId);

        return res.status(200).json({
            stallCount: stalls.length,
            stalls,
        });
    } catch (error) {
        console.error("Controller error (getManagedStalls):", error);

        return res.status(500).json({
            error: "Unable to retrieve the stalls you manage",
        });
    }
}

// Retrieve the hawker centres the signed in operator runs
async function getManagedCentres(req, res) {
    try {
        const operatorId = await requireOperatorId(req, res);

        if (operatorId === null) return;

        const centres = await rentalModel.getManagedCentres(operatorId);

        return res.status(200).json({
            centreCount: centres.length,
            centres,
        });
    } catch (error) {
        console.error("Controller error (getManagedCentres):", error);

        return res.status(500).json({
            error: "Unable to retrieve the hawker centres you manage",
        });
    }
}

// Retrieve the vendor accounts an agreement can be recorded against
async function getVendorAccounts(req, res) {
    try {
        const vendors = await rentalModel.getVendorAccounts();

        return res.status(200).json({
            vendorCount: vendors.length,
            vendors,
        });
    } catch (error) {
        console.error("Controller error (getVendorAccounts):", error);

        return res.status(500).json({
            error: "Unable to retrieve vendor accounts",
        });
    }
}

/*
 * Retrieve one agreement. An operator may read it when the stall sits in one of
 * their hawker centres, and a vendor only when the agreement is their own.
 */
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

        if (isOperator(req.user)) {
            const operatorId = await requireOperatorId(req, res);

            if (operatorId === null) return;

            if (Number(agreement.OperatorID) !== operatorId) {
                return res.status(403).json({
                    error:
                        "This stall is in a hawker centre you do not manage",
                });
            }
        } else if (
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
        const operatorId = await requireOperatorId(req, res);

        if (operatorId === null) return;

        const stall = await rentalModel.getStallById(req.body.StallID);

        if (!stall) {
            return res.status(404).json({ error: "Food stall not found" });
        }

        // A stall can only be rented out by the operator of its hawker centre
        if (Number(stall.OperatorID) !== operatorId) {
            return res.status(403).json({
                error:
                    `${stall.StallName} is in ${stall.HCName}, ` +
                    "which is run by another operator",
            });
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
        const operatorId = await requireOperatorId(req, res);

        if (operatorId === null) return;

        const agreementId = Number(req.params.id);

        const agreement = await rentalModel.getAgreementById(agreementId);

        if (!agreement) {
            return res.status(404).json({
                error: "Rental agreement not found",
            });
        }

        // Only the operator of the hawker centre may renew the tenancy
        if (Number(agreement.OperatorID) !== operatorId) {
            return res.status(403).json({
                error: "This stall is in a hawker centre you do not manage",
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

/*
 * End a tenancy and hand the stall back.
 *
 * A tenancy is ended today unless the operator names another day. An agreement
 * that has already run out can be ended too, because that is how a stall still
 * showing a tenant who left long ago is released.
 */
async function endAgreement(req, res) {
    try {
        const operatorId = await requireOperatorId(req, res);

        if (operatorId === null) return;

        const agreementId = Number(req.params.id);

        const agreement = await rentalModel.getAgreementById(agreementId);

        if (!agreement) {
            return res.status(404).json({
                error: "Rental agreement not found",
            });
        }

        if (Number(agreement.OperatorID) !== operatorId) {
            return res.status(403).json({
                error: "This stall is in a hawker centre you do not manage",
            });
        }

        if (agreement.TerminatedOn) {
            return res.status(409).json({
                error:
                    "This tenancy was already ended on " +
                    new Date(agreement.TerminatedOn)
                        .toISOString()
                        .slice(0, 10),
            });
        }

        const terminatedOn = req.body.EndDate
            ? new Date(req.body.EndDate)
            : new Date();

        const stallId = await rentalModel.endAgreement(
            agreementId,
            terminatedOn.toISOString().slice(0, 10)
        );

        if (!stallId) {
            return res.status(404).json({
                error: "Rental agreement not found",
            });
        }

        const ended = await rentalModel.getAgreementById(agreementId);

        return res.status(200).json({
            message: `Tenancy of ${agreement.StallName} ended`,
            agreement: ended,
        });
    } catch (error) {
        console.error("Controller error (endAgreement):", error);

        return res.status(500).json({
            error: "Unable to end the tenancy",
        });
    }
}

module.exports = {
    getAgreements,
    getExpiringAgreements,
    getManagedStalls,
    getManagedCentres,
    getVendorAccounts,
    getAgreementById,
    createAgreement,
    renewAgreement,
    endAgreement,
};
