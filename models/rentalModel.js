// Rental Model - Handles database operations for stall rental agreements
// between the hawker centre operator and a vendor
const sql = require("mssql");
const dbConfig = require("../dbConfig");

/*
 * sql.connect() returns the connection pool shared by the whole application, so
 * closing it after a query would close it for every request that is still
 * running and those requests fail with ECONNCLOSED. The pool is therefore left
 * open here and app.js closes it once when the server shuts down.
 */

/*
 * A tenancy is in force when the vendor has signed it, today falls inside its
 * dates and the operator has not ended it early. Every query that asks who runs
 * a stall today uses this one definition, so the register, the stall itself and
 * the occupancy figures can never answer that question differently.
 *
 * The signature is part of the test because an agreement now exists from the
 * moment it is offered. Until the vendor accepts it, it holds no stall and the
 * unit is still vacant.
 */
const TENANCY_IN_FORCE = `
    ra.AcceptedOn IS NOT NULL
    AND ra.TerminatedOn IS NULL
    AND CAST(GETDATE() AS DATE) BETWEEN ra.StartDate AND ra.EndDate
`;

/*
 * Whose stall it is.
 *
 * A tenancy signed today but starting next month still belongs to the vendor
 * who signed it: they need the unit to build a menu before opening day, and
 * nothing revisits an agreement once it is signed, so a stall left unassigned
 * here would stay unassigned for the whole of the tenancy.
 *
 * TENANCY_IN_FORCE stays the test for who is trading today, which is what the
 * occupancy figures ask. This is the test for who the stall is handed to.
 */
const TENANCY_HELD = `
    ra.AcceptedOn IS NOT NULL
    AND ra.CancelledOn IS NULL
    AND ra.TerminatedOn IS NULL
    AND ra.EndDate >= CAST(GETDATE() AS DATE)
`;

/*
 * The status of an agreement.
 *
 * The two outcomes of the offer come first, because an agreement nobody has
 * signed yet still carries the dates and rent it was offered with and would
 * otherwise read as a running tenancy. Ended comes before the date tests for
 * the same reason: a tenancy ended early keeps its agreed end date.
 */
const AGREEMENT_STATUS = `
    CASE
        WHEN ra.CancelledOn IS NOT NULL THEN 'Cancelled'
        WHEN ra.AcceptedOn IS NULL THEN 'Awaiting Signature'
        WHEN ra.TerminatedOn IS NOT NULL THEN 'Ended'
        WHEN ra.EndDate < CAST(GETDATE() AS DATE) THEN 'Expired'
        WHEN ra.StartDate > CAST(GETDATE() AS DATE) THEN 'Upcoming'
        ELSE 'Active'
    END
`;

/*
 * Every agreement is returned with a status derived from today's date so the
 * frontend never has to work it out, and with the number of days remaining so
 * an agreement that is about to expire can be highlighted.
 */
const AGREEMENT_COLUMNS = `
    ra.AgreementID,
    ra.StallID,
    ra.VendorUserID,
    ra.StartDate,
    ra.EndDate,
    ra.RentalPrice,
    ra.TermCondition,
    ra.AcceptedOn,
    ra.CancelledOn,
    ra.TerminatedOn,
    fs.StallName,
    fs.StallUnitNo,
    hc.HCName,
    hc.OperatorID,
    ua.Username AS VendorName,
    ua.Email AS VendorEmail,
    ${AGREEMENT_STATUS} AS AgreementStatus,
    DATEDIFF(DAY, CAST(GETDATE() AS DATE), ra.EndDate) AS DaysRemaining
`;

const AGREEMENT_JOINS = `
    FROM RentalAgreement ra
    JOIN FoodStall fs
        ON ra.StallID = fs.StallID
    JOIN HawkerCentre hc
        ON fs.HawkerCentreID = hc.HawkerCentreID
    JOIN UserAccount ua
        ON ra.VendorUserID = ua.UserID
`;

/*
 * Retrieve agreements. A vendor only ever receives their own agreements and an
 * operator only ever receives the stalls inside the hawker centres it runs.
 */
async function getAgreements({
    vendorUserId = null,
    operatorId = null,
    status = null,
} = {}) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("VendorUserID", sql.Int, vendorUserId);
        request.input("OperatorID", sql.Int, operatorId);
        request.input("Status", sql.VarChar(10), status);

        const result = await request.query(`
            SELECT ${AGREEMENT_COLUMNS}
            ${AGREEMENT_JOINS}
            WHERE (@VendorUserID IS NULL OR ra.VendorUserID = @VendorUserID)
              AND (@OperatorID IS NULL OR hc.OperatorID = @OperatorID)
              AND (@Status IS NULL OR @Status = ${AGREEMENT_STATUS})
            ORDER BY ra.EndDate;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getAgreements):", error);
        throw error;
    }
}

// Retrieve one agreement by its ID
async function getAgreementById(agreementId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("AgreementID", sql.Int, agreementId);

        const result = await request.query(`
            SELECT ${AGREEMENT_COLUMNS}
            ${AGREEMENT_JOINS}
            WHERE ra.AgreementID = @AgreementID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getAgreementById):", error);
        throw error;
    }
}

// Retrieve agreements that expire within the given number of days
async function getExpiringAgreements(days, operatorId = null) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("Days", sql.Int, days);
        request.input("OperatorID", sql.Int, operatorId);

        const result = await request.query(`
            SELECT ${AGREEMENT_COLUMNS}
            ${AGREEMENT_JOINS}
            WHERE ra.TerminatedOn IS NULL
              AND ra.EndDate >= CAST(GETDATE() AS DATE)
              AND ra.EndDate <= DATEADD(DAY, @Days, CAST(GETDATE() AS DATE))
              AND (@OperatorID IS NULL OR hc.OperatorID = @OperatorID)
            ORDER BY ra.EndDate;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getExpiringAgreements):", error);
        throw error;
    }
}

/*
 * Find an agreement for the same stall whose period overlaps the requested one.
 * A stall cannot be rented to two vendors at the same time, so this is checked
 * before an agreement is created or renewed.
 */
async function findOverlappingAgreement(stallId, startDate, endDate, excludeAgreementId = null) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("StallID", sql.Int, stallId);
        request.input("StartDate", sql.Date, startDate);
        request.input("EndDate", sql.Date, endDate);
        request.input("ExcludeAgreementID", sql.Int, excludeAgreementId);

        const result = await request.query(`
            SELECT TOP 1
                ra.AgreementID,
                ra.StartDate,
                ra.EndDate,
                ua.Username AS VendorName
            FROM RentalAgreement ra
            JOIN UserAccount ua
                ON ra.VendorUserID = ua.UserID
            WHERE ra.StallID = @StallID
              AND ra.TerminatedOn IS NULL
              AND ra.CancelledOn IS NULL
              AND (@ExcludeAgreementID IS NULL OR ra.AgreementID <> @ExcludeAgreementID)
              AND ra.StartDate <= @EndDate
              AND ra.EndDate >= @StartDate
            ORDER BY ra.StartDate;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (findOverlappingAgreement):", error);
        throw error;
    }
}

/*
 * Confirm the stall exists before an agreement refers to it. The operator of
 * the hawker centre is read at the same time, because that is what decides
 * whether the signed in operator is allowed to rent this stall out.
 */
async function getStallById(stallId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("StallID", sql.Int, stallId);

        const result = await request.query(`
            SELECT
                fs.StallID,
                fs.StallName,
                fs.VendorUserID,
                hc.HawkerCentreID,
                hc.HCName,
                hc.OperatorID
            FROM FoodStall fs
            JOIN HawkerCentre hc
                ON fs.HawkerCentreID = hc.HawkerCentreID
            WHERE fs.StallID = @StallID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getStallById):", error);
        throw error;
    }
}

// Confirm the account named on an agreement is a vendor account
async function getVendorById(vendorUserId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("UserID", sql.Int, vendorUserId);

        const result = await request.query(`
            SELECT UserID, Username, Role
            FROM UserAccount
            WHERE UserID = @UserID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getVendorById):", error);
        throw error;
    }
}

/*
 * The stalls an operator is responsible for, found by following the operator to
 * its hawker centres and then to the stalls inside them.
 *
 * Each stall carries the tenancy in force today and the grade of its last
 * inspection, because a unit standing empty and a unit graded poorly are the
 * two things an operator has to act on.
 */
async function getManagedStalls(operatorId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("OperatorID", sql.Int, operatorId);

        const result = await request.query(`
            SELECT
                fs.StallID,
                fs.StallName,
                fs.StallUnitNo,
                fs.IsActive,
                hc.HawkerCentreID,
                hc.HCName,
                tenancy.AgreementID,
                tenancy.EndDate AS TenancyEndDate,
                tenancy.RentalPrice,
                tenant.Username AS TenantName,
                grade.HygieneGrade,
                grade.InspectionDate,
                offered.OfferID AS PendingOfferID,
                offered.VendorName AS PendingOfferVendor,
                CASE WHEN tenancy.AgreementID IS NULL THEN 0 ELSE 1 END
                    AS HasCurrentTenancy,
                CASE
                    WHEN tenancy.EndDate IS NULL THEN NULL
                    ELSE DATEDIFF(DAY, CAST(GETDATE() AS DATE), tenancy.EndDate)
                END AS DaysRemaining
            FROM FoodStall fs
            JOIN HawkerCentre hc
                ON fs.HawkerCentreID = hc.HawkerCentreID
            OUTER APPLY (
                SELECT TOP 1
                    ra.AgreementID,
                    ra.VendorUserID,
                    ra.EndDate,
                    ra.RentalPrice
                FROM RentalAgreement ra
                WHERE ra.StallID = fs.StallID
                  AND ${TENANCY_IN_FORCE}
                ORDER BY ra.StartDate DESC, ra.AgreementID DESC
            ) tenancy
            LEFT JOIN UserAccount tenant
                ON tenancy.VendorUserID = tenant.UserID
            OUTER APPLY (
                SELECT TOP 1 i.HygieneGrade, i.InspectionDate
                FROM Inspection i
                WHERE i.StallID = fs.StallID
                ORDER BY i.InspectionDate DESC, i.InspectionID DESC
            ) grade
            /*
             * A stall with an unanswered offer on it is neither let nor free to
             * offer again, so the offer is read alongside the tenancy to keep
             * the register from calling that unit ready to let.
             */
            OUTER APPLY (
                SELECT TOP 1
                    ao.OfferID,
                    vendor.Username AS VendorName
                FROM AgreementOffer ao
                JOIN RentalAgreement pending
                    ON ao.AgreementID = pending.AgreementID
                JOIN UserAccount vendor
                    ON pending.VendorUserID = vendor.UserID
                WHERE pending.StallID = fs.StallID
                  AND ao.OfferType = 'New Tenancy'
                  AND ao.OfferStatus = 'Pending Signature'
                ORDER BY ao.CreatedAt DESC, ao.OfferID DESC
            ) offered
            WHERE hc.OperatorID = @OperatorID
            ORDER BY hc.HCName, fs.StallName;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getManagedStalls):", error);
        throw error;
    }
}

/*
 * The hawker centres an operator runs. Nothing in the application read this
 * table before, so an operator had no way to see the premises it is
 * responsible for or how much of it is let.
 */
async function getManagedCentres(operatorId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("OperatorID", sql.Int, operatorId);

        /*
         * Whether a stall is let is worked out per stall first. SQL Server
         * cannot total up an expression that contains a subquery, so the flag
         * has to exist as a column before it can be added together.
         */
        const result = await request.query(`
            SELECT
                hc.HawkerCentreID,
                hc.HCName,
                hc.HCAddress,
                hc.Area,
                COUNT(stall.StallID) AS StallCount,
                ISNULL(SUM(stall.IsLet), 0) AS RentedCount
            FROM HawkerCentre hc
            LEFT JOIN (
                SELECT
                    fs.StallID,
                    fs.HawkerCentreID,
                    CASE
                        WHEN EXISTS (
                            SELECT 1
                            FROM RentalAgreement ra
                            WHERE ra.StallID = fs.StallID
                              AND ${TENANCY_IN_FORCE}
                        ) THEN 1
                        ELSE 0
                    END AS IsLet
                FROM FoodStall fs
            ) stall
                ON stall.HawkerCentreID = hc.HawkerCentreID
            WHERE hc.OperatorID = @OperatorID
            GROUP BY hc.HawkerCentreID, hc.HCName, hc.HCAddress, hc.Area
            ORDER BY hc.HCName;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getManagedCentres):", error);
        throw error;
    }
}

/*
 * Read the operator a signed in account works for.
 *
 * The operator is looked up from the database on every request instead of being
 * carried in the token. A token issued before an account changed operator would
 * otherwise keep the old one, and nothing sent by the browser can widen what an
 * operator is allowed to see.
 */
async function getOperatorIdForUser(userId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("UserID", sql.Int, userId);

        const result = await request.query(`
            SELECT ua.OperatorID, o.OperatorName
            FROM UserAccount ua
            LEFT JOIN Operator o
                ON ua.OperatorID = o.OperatorID
            WHERE ua.UserID = @UserID
              AND ua.Role = 'operator';
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getOperatorIdForUser):", error);
        throw error;
    }
}

/*
 * List every vendor account so the operator can pick one when recording a
 * tenancy. Only the name and ID are read because that is all the form needs,
 * and the count of stalls already held shows who is without a stall.
 */
async function getVendorAccounts() {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const result = await connection.request().query(`
            SELECT
                ua.UserID,
                ua.Username,
                COUNT(fs.StallID) AS StallCount
            FROM UserAccount ua
            LEFT JOIN FoodStall fs
                ON fs.VendorUserID = ua.UserID
            WHERE ua.Role = 'vendor'
            GROUP BY ua.UserID, ua.Username
            ORDER BY ua.Username;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getVendorAccounts):", error);
        throw error;
    }
}

/*
 * Create an agreement and assign the stall to the vendor in the same
 * transaction, so a stall is never left rented on paper but unassigned in the
 * application.
 */
async function createAgreement(agreement) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("StallID", sql.Int, agreement.StallID);
        request.input("VendorUserID", sql.Int, agreement.VendorUserID);
        request.input("StartDate", sql.Date, agreement.StartDate);
        request.input("EndDate", sql.Date, agreement.EndDate);
        request.input("RentalPrice", sql.Decimal(8, 2), agreement.RentalPrice);
        request.input("TermCondition", sql.VarChar(800), agreement.TermCondition || null);

        /*
         * The agreement is written unsigned, with AcceptedOn left NULL. It is
         * the record of what the vendor is being asked to take on, and nothing
         * more: the stall is not handed over here, because a tenancy the vendor
         * has not agreed to is not a tenancy. Signing the offer is what fills
         * AcceptedOn in and puts the vendor on the stall.
         */
        const result = await request.query(`
            INSERT INTO RentalAgreement (
                StallID,
                VendorUserID,
                StartDate,
                EndDate,
                RentalPrice,
                TermCondition
            )
            OUTPUT INSERTED.AgreementID
            VALUES (
                @StallID,
                @VendorUserID,
                @StartDate,
                @EndDate,
                @RentalPrice,
                @TermCondition
            );
        `);

        return result.recordset[0].AgreementID;
    } catch (error) {
        console.error("Database error (createAgreement):", error);
        throw error;
    }
}

/*
 * Every offer is returned with both the terms being proposed and the terms
 * already in force, because the only thing a vendor really has to decide is
 * what is changing between the two.
 */
const OFFER_COLUMNS = `
    ao.OfferID,
    ao.AgreementID,
    ao.OfferType,
    ao.OfferedByUserID,
    ao.ProposedEndDate,
    ao.ProposedRentalPrice,
    ao.OfferNote,
    ao.OfferStatus,
    ao.CreatedAt,
    ao.RespondedAt,
    ao.SignatureName,
    ao.SignatureHash,
    ao.ResponseNote,
    ra.StallID,
    ra.VendorUserID,
    ra.StartDate,
    ra.EndDate AS CurrentEndDate,
    ra.RentalPrice AS CurrentRentalPrice,
    ra.TermCondition,
    ra.AcceptedOn,
    ra.CancelledOn,
    ra.TerminatedOn,
    ${AGREEMENT_STATUS} AS AgreementStatus,
    fs.StallName,
    fs.StallUnitNo,
    hc.HCName,
    hc.OperatorID,
    o.OperatorName,
    vendor.Username AS VendorName,
    vendor.Email AS VendorEmail,
    offeredBy.Username AS OfferedByName,
    ao.ProposedRentalPrice - ra.RentalPrice AS PriceChange
`;

const OFFER_JOINS = `
    FROM AgreementOffer ao
    JOIN RentalAgreement ra
        ON ao.AgreementID = ra.AgreementID
    JOIN FoodStall fs
        ON ra.StallID = fs.StallID
    JOIN HawkerCentre hc
        ON fs.HawkerCentreID = hc.HawkerCentreID
    JOIN Operator o
        ON hc.OperatorID = o.OperatorID
    JOIN UserAccount vendor
        ON ra.VendorUserID = vendor.UserID
    JOIN UserAccount offeredBy
        ON ao.OfferedByUserID = offeredBy.UserID
`;

/*
 * Put terms to a vendor, either for a stall they do not hold yet or for the
 * renewal of one they do.
 *
 * Neither kind takes effect on its own. A renewal leaves the running agreement
 * untouched, and a new tenancy leaves its agreement unsigned and holding no
 * stall, so in both cases a vendor who says no keeps exactly what they had.
 */
async function createOffer({
    agreementId,
    offerType = "Renewal",
    offeredByUserId,
    proposedEndDate,
    proposedRentalPrice,
    offerNote,
}) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("AgreementID", sql.Int, agreementId);
        request.input("OfferType", sql.VarChar(20), offerType);
        request.input("OfferedByUserID", sql.Int, offeredByUserId);
        request.input("ProposedEndDate", sql.Date, proposedEndDate);
        request.input(
            "ProposedRentalPrice",
            sql.Decimal(8, 2),
            proposedRentalPrice
        );
        request.input("OfferNote", sql.VarChar(500), offerNote ?? null);

        const result = await request.query(`
            INSERT INTO AgreementOffer
                (AgreementID, OfferType, OfferedByUserID, ProposedEndDate, ProposedRentalPrice, OfferNote)
            OUTPUT INSERTED.OfferID
            VALUES
                (@AgreementID, @OfferType, @OfferedByUserID, @ProposedEndDate, @ProposedRentalPrice, @OfferNote);
        `);

        return result.recordset[0].OfferID;
    } catch (error) {
        console.error("Database error (createOffer):", error);
        throw error;
    }
}

// Read one offer with the agreement, stall and operator behind it
async function getOfferById(offerId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("OfferID", sql.Int, offerId);

        const result = await request.query(`
            SELECT ${OFFER_COLUMNS}
            ${OFFER_JOINS}
            WHERE ao.OfferID = @OfferID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getOfferById):", error);
        throw error;
    }
}

/*
 * The offers on one side of the table. A vendor is matched on the agreement
 * they hold and an operator on the hawker centre the stall stands in, so
 * neither ever receives terms that are none of their business.
 */
async function getOffers({ vendorUserId = null, operatorId = null, status = null }) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("VendorUserID", sql.Int, vendorUserId);
        request.input("OperatorID", sql.Int, operatorId);
        request.input("OfferStatus", sql.VarChar(30), status);

        const result = await request.query(`
            SELECT ${OFFER_COLUMNS}
            ${OFFER_JOINS}
            WHERE (@VendorUserID IS NULL OR ra.VendorUserID = @VendorUserID)
              AND (@OperatorID IS NULL OR hc.OperatorID = @OperatorID)
              AND (@OfferStatus IS NULL OR ao.OfferStatus = @OfferStatus)
            ORDER BY ao.CreatedAt DESC, ao.OfferID DESC;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getOffers):", error);
        throw error;
    }
}

/*
 * Accept an offer on the vendor's signature.
 *
 * The signature and the change it authorises are written in one transaction. If
 * the agreement could not be moved onto the new terms the signature is rolled
 * back with it, because a signed offer that never took effect would tell the
 * operator the vendor had agreed to terms they are not actually on.
 *
 * What the signature does depends on what was offered. A renewal moves the
 * running agreement onto the new end date and rent. A new tenancy fills in
 * AcceptedOn, which is the moment the agreement starts to count, and hands the
 * stall over if that tenancy is in force today.
 *
 * The offer is only signable while it is still pending, so a second click
 * cannot apply the same rise twice.
 */
async function signOffer(offerId, signatureName, signatureHash) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        const signRequest = new sql.Request(transaction);
        signRequest.input("OfferID", sql.Int, offerId);
        signRequest.input("SignatureName", sql.VarChar(80), signatureName);
        signRequest.input("SignatureHash", sql.Char(64), signatureHash);

        const signed = await signRequest.query(`
            UPDATE AgreementOffer
            SET OfferStatus = 'Signed',
                RespondedAt = GETDATE(),
                SignatureName = @SignatureName,
                SignatureHash = @SignatureHash
            OUTPUT
                INSERTED.OfferID,
                INSERTED.AgreementID,
                INSERTED.OfferType,
                INSERTED.ProposedEndDate,
                INSERTED.ProposedRentalPrice
            WHERE OfferID = @OfferID
              AND OfferStatus = 'Pending Signature';
        `);

        if (!signed.recordset.length) {
            await transaction.rollback();
            transactionStarted = false;

            return null;
        }

        const offer = signed.recordset[0];

        const applyRequest = new sql.Request(transaction);
        applyRequest.input("AgreementID", sql.Int, offer.AgreementID);
        applyRequest.input("EndDate", sql.Date, offer.ProposedEndDate);
        applyRequest.input(
            "RentalPrice",
            sql.Decimal(8, 2),
            offer.ProposedRentalPrice
        );

        if (offer.OfferType === "New Tenancy") {
            /*
             * Accepting brings the agreement into being on the terms it was
             * offered with. Those are already on the row, so only the
             * acceptance itself is written, and only while it is still unsigned
             * and uncancelled.
             */
            const accepted = await applyRequest.query(`
                UPDATE RentalAgreement
                SET AcceptedOn = GETDATE()
                OUTPUT INSERTED.AgreementID, INSERTED.StallID, INSERTED.VendorUserID
                WHERE AgreementID = @AgreementID
                  AND AcceptedOn IS NULL
                  AND CancelledOn IS NULL;
            `);

            if (!accepted.recordset.length) {
                await transaction.rollback();
                transactionStarted = false;

                return null;
            }

            // Accepting hands the unit over, whether it opens today or later
            const assignRequest = new sql.Request(transaction);
            assignRequest.input("StallID", sql.Int, accepted.recordset[0].StallID);
            assignRequest.input(
                "VendorUserID",
                sql.Int,
                accepted.recordset[0].VendorUserID
            );

            await assignRequest.query(`
                UPDATE FoodStall
                SET VendorUserID = @VendorUserID
                WHERE StallID = @StallID
                  AND EXISTS (
                        SELECT 1
                        FROM RentalAgreement ra
                        WHERE ra.StallID = @StallID
                          AND ra.VendorUserID = @VendorUserID
                          AND ${TENANCY_HELD}
                  );
            `);
        } else {
            // A renewal moves the agreement already in force onto the new terms
            await applyRequest.query(`
                UPDATE RentalAgreement
                SET EndDate = @EndDate,
                    RentalPrice = @RentalPrice
                WHERE AgreementID = @AgreementID;
            `);
        }

        await transaction.commit();
        transactionStarted = false;

        return offer.AgreementID;
    } catch (error) {
        console.error("Database error (signOffer):", error);

        if (transactionStarted) {
            await transaction.rollback();
        }

        throw error;
    }
}

/*
 * Close an offer without accepting it, either because the vendor turned it down
 * or because the operator took it back.
 *
 * A renewal leaves its agreement untouched, which is what keeps the vendor on
 * the last set of terms both sides actually agreed to. A new tenancy has no
 * such earlier terms to fall back on, so its agreement is marked cancelled and
 * the stall it was for stays vacant and free to offer to somebody else.
 *
 * Both writes share one transaction, so an offer can never end up refused while
 * the agreement it was for is still sitting open.
 */
async function closeOffer(offerId, offerStatus, responseNote = null) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        const closeRequest = new sql.Request(transaction);
        closeRequest.input("OfferID", sql.Int, offerId);
        closeRequest.input("OfferStatus", sql.VarChar(30), offerStatus);
        closeRequest.input("ResponseNote", sql.VarChar(300), responseNote);

        const closed = await closeRequest.query(`
            UPDATE AgreementOffer
            SET OfferStatus = @OfferStatus,
                RespondedAt = GETDATE(),
                ResponseNote = @ResponseNote
            OUTPUT INSERTED.OfferID, INSERTED.AgreementID, INSERTED.OfferType
            WHERE OfferID = @OfferID
              AND OfferStatus = 'Pending Signature';
        `);

        if (!closed.recordset.length) {
            await transaction.rollback();
            transactionStarted = false;

            return null;
        }

        const offer = closed.recordset[0];

        if (offer.OfferType === "New Tenancy") {
            const cancelRequest = new sql.Request(transaction);
            cancelRequest.input("AgreementID", sql.Int, offer.AgreementID);

            await cancelRequest.query(`
                UPDATE RentalAgreement
                SET CancelledOn = GETDATE()
                WHERE AgreementID = @AgreementID
                  AND AcceptedOn IS NULL
                  AND CancelledOn IS NULL;
            `);
        }

        await transaction.commit();
        transactionStarted = false;

        return offer.OfferID;
    } catch (error) {
        console.error("Database error (closeOffer):", error);

        if (transactionStarted) {
            await transaction.rollback();
        }

        throw error;
    }
}

// The vendor turns the terms down
async function rejectOffer(offerId, responseNote) {
    return closeOffer(offerId, "Rejected", responseNote ?? null);
}

// The operator takes back an offer the vendor has not answered yet
async function withdrawOffer(offerId) {
    return closeOffer(offerId, "Withdrawn");
}

// The offer already waiting on this agreement, if there is one
async function findOpenOffer(agreementId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("AgreementID", sql.Int, agreementId);

        const result = await request.query(`
            SELECT ${OFFER_COLUMNS}
            ${OFFER_JOINS}
            WHERE ao.AgreementID = @AgreementID
              AND ao.OfferStatus = 'Pending Signature';
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (findOpenOffer):", error);
        throw error;
    }
}

/*
 * Nothing writes the new end date and price straight onto an agreement any
 * more. A renewal is now put to the vendor as an offer and it is signOffer that
 * moves the agreement, so that the terms and the vendor's signature for them
 * are always written together.
 */

/*
 * End a tenancy and hand the stall back.
 *
 * Creating an agreement puts the vendor on the stall, but nothing ever took
 * them off again, so a tenant kept the stall, its menu and its orders long
 * after the tenancy was over. Ending one records the day it was ended and then
 * works out who holds the stall today: the vendor of whichever agreement is
 * still in force, or nobody at all when the unit falls vacant.
 *
 * The agreed end date is left exactly as it was signed. A tenancy ended early
 * is a different fact from a tenancy that ran its course, and writing the
 * termination down separately is the only way to tell a tenancy that ends on
 * the day it starts from one that is still running.
 *
 * Both steps share one transaction so the register and the stall can never
 * disagree about who runs it.
 */
async function endAgreement(agreementId, terminatedOn) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        const closeRequest = new sql.Request(transaction);
        closeRequest.input("AgreementID", sql.Int, agreementId);
        closeRequest.input("TerminatedOn", sql.Date, terminatedOn);

        const closed = await closeRequest.query(`
            UPDATE RentalAgreement
            SET TerminatedOn = @TerminatedOn
            OUTPUT INSERTED.StallID
            WHERE AgreementID = @AgreementID
              AND AcceptedOn IS NOT NULL
              AND TerminatedOn IS NULL;
        `);

        if (!closed.recordset.length) {
            await transaction.rollback();
            transactionStarted = false;

            return null;
        }

        const stallId = closed.recordset[0].StallID;

        /*
         * Whoever still holds a signed tenancy is the vendor of record. A
         * tenancy already agreed for the months ahead counts, so ending one
         * early hands the unit to the incoming vendor rather than emptying it.
         */
        const assignRequest = new sql.Request(transaction);
        assignRequest.input("StallID", sql.Int, stallId);

        await assignRequest.query(`
            UPDATE FoodStall
            SET VendorUserID = (
                SELECT TOP 1 ra.VendorUserID
                FROM RentalAgreement ra
                WHERE ra.StallID = @StallID
                  AND ${TENANCY_HELD}
                ORDER BY
                    CASE
                        WHEN CAST(GETDATE() AS DATE)
                             BETWEEN ra.StartDate AND ra.EndDate THEN 0
                        ELSE 1
                    END,
                    ra.StartDate,
                    ra.AgreementID
            )
            WHERE StallID = @StallID;
        `);

        await transaction.commit();
        transactionStarted = false;

        return stallId;
    } catch (error) {
        console.error("Database error (endAgreement):", error);

        if (transactionStarted) {
            await transaction.rollback();
        }

        throw error;
    }
}

module.exports = {
    getAgreements,
    getAgreementById,
    getExpiringAgreements,
    findOverlappingAgreement,
    getStallById,
    getVendorById,
    getVendorAccounts,
    getManagedStalls,
    getManagedCentres,
    getOperatorIdForUser,
    createAgreement,
    endAgreement,
    createOffer,
    getOfferById,
    getOffers,
    signOffer,
    rejectOffer,
    withdrawOffer,
    findOpenOffer,
};
