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
 * A tenancy is in force when today falls inside its dates and the operator has
 * not ended it early. Every query that asks who runs a stall today uses this
 * one definition, so the register, the stall itself and the occupancy figures
 * can never answer that question differently.
 */
const TENANCY_IN_FORCE = `
    ra.TerminatedOn IS NULL
    AND CAST(GETDATE() AS DATE) BETWEEN ra.StartDate AND ra.EndDate
`;

/*
 * The status of an agreement. Ended comes first because an agreement that was
 * ended early still carries the end date it was signed with, which on its own
 * would make it look like it is still running.
 */
const AGREEMENT_STATUS = `
    CASE
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
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        const agreementRequest = new sql.Request(transaction);
        agreementRequest.input("StallID", sql.Int, agreement.StallID);
        agreementRequest.input("VendorUserID", sql.Int, agreement.VendorUserID);
        agreementRequest.input("StartDate", sql.Date, agreement.StartDate);
        agreementRequest.input("EndDate", sql.Date, agreement.EndDate);
        agreementRequest.input("RentalPrice", sql.Decimal(8, 2), agreement.RentalPrice);
        agreementRequest.input("TermCondition", sql.VarChar(800), agreement.TermCondition || null);

        const result = await agreementRequest.query(`
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

        // The vendor of an agreement that is in force today also runs the stall
        const assignRequest = new sql.Request(transaction);
        assignRequest.input("StallID", sql.Int, agreement.StallID);
        assignRequest.input("VendorUserID", sql.Int, agreement.VendorUserID);

        await assignRequest.query(`
            UPDATE FoodStall
            SET VendorUserID = @VendorUserID
            WHERE StallID = @StallID
              AND EXISTS (
                    SELECT 1
                    FROM RentalAgreement ra
                    WHERE ra.StallID = @StallID
                      AND ra.VendorUserID = @VendorUserID
                      AND ${TENANCY_IN_FORCE}
              );
        `);

        await transaction.commit();

        return result.recordset[0].AgreementID;
    } catch (error) {
        console.error("Database error (createAgreement):", error);

        if (transactionStarted) {
            await transaction.rollback();
        }

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
    ra.TerminatedOn,
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
 * Put new tenancy terms to the vendor of an agreement.
 *
 * Nothing on the agreement itself is touched. The offer only records what is
 * being asked for, so a vendor who turns it down is left on exactly the terms
 * they were already holding.
 */
async function createOffer({
    agreementId,
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
                (AgreementID, OfferedByUserID, ProposedEndDate, ProposedRentalPrice, OfferNote)
            OUTPUT INSERTED.OfferID
            VALUES
                (@AgreementID, @OfferedByUserID, @ProposedEndDate, @ProposedRentalPrice, @OfferNote);
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

        // The signature is what moves the agreement onto the new terms
        const applyRequest = new sql.Request(transaction);
        applyRequest.input("AgreementID", sql.Int, offer.AgreementID);
        applyRequest.input("EndDate", sql.Date, offer.ProposedEndDate);
        applyRequest.input(
            "RentalPrice",
            sql.Decimal(8, 2),
            offer.ProposedRentalPrice
        );

        await applyRequest.query(`
            UPDATE RentalAgreement
            SET EndDate = @EndDate,
                RentalPrice = @RentalPrice
            WHERE AgreementID = @AgreementID;
        `);

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
 * Turn an offer down. The agreement is deliberately left untouched, which is
 * what keeps the vendor on the last set of terms both sides actually agreed to.
 */
async function rejectOffer(offerId, responseNote) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("OfferID", sql.Int, offerId);
        request.input("ResponseNote", sql.VarChar(300), responseNote ?? null);

        const result = await request.query(`
            UPDATE AgreementOffer
            SET OfferStatus = 'Rejected',
                RespondedAt = GETDATE(),
                ResponseNote = @ResponseNote
            OUTPUT INSERTED.OfferID
            WHERE OfferID = @OfferID
              AND OfferStatus = 'Pending Signature';
        `);

        return result.recordset[0] ? result.recordset[0].OfferID : null;
    } catch (error) {
        console.error("Database error (rejectOffer):", error);
        throw error;
    }
}

// Withdraw an offer the operator no longer wants to stand behind
async function withdrawOffer(offerId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("OfferID", sql.Int, offerId);

        const result = await request.query(`
            UPDATE AgreementOffer
            SET OfferStatus = 'Withdrawn',
                RespondedAt = GETDATE()
            OUTPUT INSERTED.OfferID
            WHERE OfferID = @OfferID
              AND OfferStatus = 'Pending Signature';
        `);

        return result.recordset[0] ? result.recordset[0].OfferID : null;
    } catch (error) {
        console.error("Database error (withdrawOffer):", error);
        throw error;
    }
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
              AND TerminatedOn IS NULL;
        `);

        if (!closed.recordset.length) {
            await transaction.rollback();
            transactionStarted = false;

            return null;
        }

        const stallId = closed.recordset[0].StallID;

        // Whoever still has a tenancy in force is the vendor of record
        const assignRequest = new sql.Request(transaction);
        assignRequest.input("StallID", sql.Int, stallId);

        await assignRequest.query(`
            UPDATE FoodStall
            SET VendorUserID = (
                SELECT TOP 1 ra.VendorUserID
                FROM RentalAgreement ra
                WHERE ra.StallID = @StallID
                  AND ${TENANCY_IN_FORCE}
                ORDER BY ra.StartDate DESC, ra.AgreementID DESC
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
