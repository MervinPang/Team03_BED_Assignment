// Rental Controller - Handles HTTP requests for stall rental agreements
const crypto = require("crypto");
const rentalModel = require("../models/rentalModel");
const notificationModel = require("../models/notificationModel");

function isOperator(user) {
    return user.role === "operator";
}

function formatDate(value) {
    return new Date(value).toISOString().slice(0, 10);
}

function formatPrice(value) {
    return `$${Number(value).toFixed(2)}`;
}

/*
 * The signature stored against an accepted offer.
 *
 * Hashing the terms alongside the name means the signature only ever matches
 * the exact end date and price that were on the table when the vendor agreed.
 * If those were edited afterwards the hash no longer reproduces, so the record
 * shows the vendor agreed to something other than what the row now says.
 */
function buildSignatureHash(offer, signatureName) {
    return crypto
        .createHash("sha256")
        .update(
            [
                offer.OfferID,
                offer.AgreementID,
                offer.VendorUserID,
                formatDate(offer.ProposedEndDate),
                Number(offer.ProposedRentalPrice).toFixed(2),
                signatureName.trim().toLowerCase(),
            ].join("|")
        )
        .digest("hex");
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

/*
 * Put a renewal to the vendor.
 *
 * A renewal is a change to what the vendor pays and how long they are held to
 * it, so it is offered rather than applied. The agreement is left exactly as it
 * is and the new terms wait in the vendor's inbox until they sign. A vendor who
 * rejects them simply stays on the agreement already in force, which is what
 * keeps an operator from raising the rent on their own.
 */
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

        // A tenancy that has already been handed back cannot be renewed
        if (agreement.TerminatedOn) {
            return res.status(409).json({
                error:
                    "This tenancy was ended on " +
                    formatDate(agreement.TerminatedOn) +
                    " and can no longer be renewed",
            });
        }

        // A renewal always moves the end date forward
        if (new Date(req.body.EndDate) <= new Date(agreement.EndDate)) {
            return res.status(409).json({
                error:
                    "The new end date must be later than the current end date of " +
                    formatDate(agreement.EndDate),
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
                    `that ends on ${formatDate(overlapping.EndDate)}`,
            });
        }

        // Only one set of terms may sit with the vendor at a time
        const openOffer = await rentalModel.findOpenOffer(agreementId);

        if (openOffer) {
            return res.status(409).json({
                error:
                    `${agreement.VendorName} is already holding an offer on this ` +
                    "tenancy. Withdraw it before sending another.",
                offer: openOffer,
            });
        }

        const proposedRentalPrice =
            req.body.RentalPrice ?? Number(agreement.RentalPrice);

        const offerId = await rentalModel.createOffer({
            agreementId,
            offeredByUserId: Number(req.user.id),
            proposedEndDate: req.body.EndDate,
            proposedRentalPrice,
            offerNote: req.body.OfferNote || null,
        });

        const offer = await rentalModel.getOfferById(offerId);

        const priceLine =
            Number(proposedRentalPrice) === Number(agreement.RentalPrice)
                ? `the rent held at ${formatPrice(proposedRentalPrice)} per month`
                : `the rent moving from ${formatPrice(agreement.RentalPrice)} to ` +
                  `${formatPrice(proposedRentalPrice)} per month`;

        await notificationModel.createNotification({
            recipientUserId: Number(agreement.VendorUserID),
            notificationType: "Agreement Offer",
            title: `Renewal offer for ${agreement.StallName}`,
            message:
                `${offer.OperatorName} has proposed renewing your tenancy until ` +
                `${formatDate(req.body.EndDate)}, with ${priceLine}. ` +
                "Sign the offer to accept it, or reject it to stay on your current agreement.",
            offerId,
        });

        return res.status(201).json({
            message:
                `The renewal has been sent to ${agreement.VendorName} for signature. ` +
                "The current agreement stays in force until they sign it.",
            offer,
        });
    } catch (error) {
        console.error("Controller error (renewAgreement):", error);

        return res.status(500).json({
            error: "Unable to send the renewal to the vendor",
        });
    }
}

/*
 * The offers on a tenancy. A vendor sees the terms put to them and an operator
 * sees the terms they have put out across their own hawker centres.
 */
async function getOffers(req, res) {
    try {
        let vendorUserId = null;
        let operatorId = null;

        if (isOperator(req.user)) {
            operatorId = await requireOperatorId(req, res);

            if (operatorId === null) return;
        } else {
            vendorUserId = Number(req.user.id);
        }

        const offers = await rentalModel.getOffers({
            vendorUserId,
            operatorId,
            status: req.offerStatus,
        });

        return res.status(200).json({
            offerCount: offers.length,
            pendingCount: offers.filter(
                offer => offer.OfferStatus === "Pending Signature"
            ).length,
            offers,
        });
    } catch (error) {
        console.error("Controller error (getOffers):", error);

        return res.status(500).json({
            error: "Unable to retrieve the tenancy offers",
        });
    }
}

/*
 * Read the offer named in the URL and confirm the signed in vendor is the one
 * being asked to sign it. Returns null once a response has been sent.
 */
async function requireVendorOffer(req, res) {
    const offer = await rentalModel.getOfferById(Number(req.params.offerId));

    if (!offer) {
        res.status(404).json({ error: "Tenancy offer not found" });
        return null;
    }

    if (Number(offer.VendorUserID) !== Number(req.user.id)) {
        res.status(403).json({
            error: "This offer was made to another vendor",
        });

        return null;
    }

    if (offer.OfferStatus !== "Pending Signature") {
        res.status(409).json({
            error:
                `This offer was already ${offer.OfferStatus.toLowerCase()} on ` +
                formatDate(offer.RespondedAt),
        });

        return null;
    }

    return offer;
}

/*
 * Accept an offer by signing it.
 *
 * The vendor types their own account name, which is checked against the account
 * on the token, so a signature can only be given by the person it names. Once
 * the signature is stored the agreement moves onto the signed terms and the
 * operator is told, which is the digital equivalent of sending the countersigned
 * copy back.
 */
async function signOffer(req, res) {
    try {
        const offer = await requireVendorOffer(req, res);

        if (!offer) return;

        const signatureName = req.body.SignatureName.trim();

        if (
            signatureName.toLowerCase() !==
            String(offer.VendorName).trim().toLowerCase()
        ) {
            return res.status(400).json({
                error:
                    "The signature must match your account name, " +
                    `${offer.VendorName}`,
            });
        }

        const signatureHash = buildSignatureHash(offer, signatureName);

        const agreementId = await rentalModel.signOffer(
            offer.OfferID,
            signatureName,
            signatureHash
        );

        // Another request answered the offer between the read and the write
        if (agreementId === null) {
            return res.status(409).json({
                error: "This offer has already been answered",
            });
        }

        await notificationModel.createNotification({
            recipientUserId: Number(offer.OfferedByUserID),
            notificationType: "Agreement Signed",
            title: `${offer.VendorName} signed the offer for ${offer.StallName}`,
            message:
                `${signatureName} signed the renewal of ${offer.StallName} at ` +
                `${formatPrice(offer.ProposedRentalPrice)} per month until ` +
                `${formatDate(offer.ProposedEndDate)}. The tenancy is now on these terms.`,
            offerId: offer.OfferID,
        });

        const signed = await rentalModel.getOfferById(offer.OfferID);
        const agreement = await rentalModel.getAgreementById(agreementId);

        return res.status(200).json({
            message:
                `You signed the renewal of ${offer.StallName}. Your tenancy now runs to ` +
                `${formatDate(offer.ProposedEndDate)} at ` +
                `${formatPrice(offer.ProposedRentalPrice)} per month.`,
            offer: signed,
            agreement,
        });
    } catch (error) {
        console.error("Controller error (signOffer):", error);

        return res.status(500).json({
            error: "Unable to sign the tenancy offer",
        });
    }
}

/*
 * Turn an offer down. The offer is cancelled and the agreement is left on the
 * terms it already held, so rejecting never costs the vendor their stall.
 */
async function rejectOffer(req, res) {
    try {
        const offer = await requireVendorOffer(req, res);

        if (!offer) return;

        const rejected = await rentalModel.rejectOffer(
            offer.OfferID,
            req.body.ResponseNote || null
        );

        if (rejected === null) {
            return res.status(409).json({
                error: "This offer has already been answered",
            });
        }

        await notificationModel.createNotification({
            recipientUserId: Number(offer.OfferedByUserID),
            notificationType: "Agreement Rejected",
            title: `${offer.VendorName} rejected the offer for ${offer.StallName}`,
            message:
                `${offer.VendorName} did not accept the proposed terms of ` +
                `${formatPrice(offer.ProposedRentalPrice)} per month until ` +
                `${formatDate(offer.ProposedEndDate)}. The tenancy stays on its current ` +
                `terms of ${formatPrice(offer.CurrentRentalPrice)} per month until ` +
                `${formatDate(offer.CurrentEndDate)}.` +
                (req.body.ResponseNote ? ` Reason given: ${req.body.ResponseNote}` : ""),
            offerId: offer.OfferID,
        });

        const answered = await rentalModel.getOfferById(offer.OfferID);

        return res.status(200).json({
            message:
                "The offer was rejected and cancelled. Your tenancy stays on its current " +
                `terms of ${formatPrice(offer.CurrentRentalPrice)} per month until ` +
                `${formatDate(offer.CurrentEndDate)}.`,
            offer: answered,
        });
    } catch (error) {
        console.error("Controller error (rejectOffer):", error);

        return res.status(500).json({
            error: "Unable to reject the tenancy offer",
        });
    }
}

// Take back an offer the vendor has not answered yet
async function withdrawOffer(req, res) {
    try {
        const operatorId = await requireOperatorId(req, res);

        if (operatorId === null) return;

        const offer = await rentalModel.getOfferById(Number(req.params.offerId));

        if (!offer) {
            return res.status(404).json({ error: "Tenancy offer not found" });
        }

        if (Number(offer.OperatorID) !== operatorId) {
            return res.status(403).json({
                error: "This stall is in a hawker centre you do not manage",
            });
        }

        const withdrawn = await rentalModel.withdrawOffer(offer.OfferID);

        if (withdrawn === null) {
            return res.status(409).json({
                error:
                    `This offer was already ${offer.OfferStatus.toLowerCase()} and ` +
                    "can no longer be withdrawn",
            });
        }

        const answered = await rentalModel.getOfferById(offer.OfferID);

        return res.status(200).json({
            message: `The offer to ${offer.VendorName} was withdrawn`,
            offer: answered,
        });
    } catch (error) {
        console.error("Controller error (withdrawOffer):", error);

        return res.status(500).json({
            error: "Unable to withdraw the tenancy offer",
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
    getOffers,
    signOffer,
    rejectOffer,
    withdrawOffer,
};
