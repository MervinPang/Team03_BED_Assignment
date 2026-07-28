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
    fs.StallName,
    fs.StallUnitNo,
    hc.HCName,
    ua.Username AS VendorName,
    ua.Email AS VendorEmail,
    CASE
        WHEN ra.EndDate < CAST(GETDATE() AS DATE) THEN 'Expired'
        WHEN ra.StartDate > CAST(GETDATE() AS DATE) THEN 'Upcoming'
        ELSE 'Active'
    END AS AgreementStatus,
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

// Retrieve agreements. A vendor only ever receives their own agreements
async function getAgreements({ vendorUserId = null, status = null } = {}) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("VendorUserID", sql.Int, vendorUserId);
        request.input("Status", sql.VarChar(10), status);

        const result = await request.query(`
            SELECT ${AGREEMENT_COLUMNS}
            ${AGREEMENT_JOINS}
            WHERE (@VendorUserID IS NULL OR ra.VendorUserID = @VendorUserID)
              AND (
                    @Status IS NULL
                    OR @Status =
                        CASE
                            WHEN ra.EndDate < CAST(GETDATE() AS DATE) THEN 'Expired'
                            WHEN ra.StartDate > CAST(GETDATE() AS DATE) THEN 'Upcoming'
                            ELSE 'Active'
                        END
                  )
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
async function getExpiringAgreements(days) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("Days", sql.Int, days);

        const result = await request.query(`
            SELECT ${AGREEMENT_COLUMNS}
            ${AGREEMENT_JOINS}
            WHERE ra.EndDate >= CAST(GETDATE() AS DATE)
              AND ra.EndDate <= DATEADD(DAY, @Days, CAST(GETDATE() AS DATE))
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

// Confirm the stall exists before an agreement refers to it
async function getStallById(stallId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("StallID", sql.Int, stallId);

        const result = await request.query(`
            SELECT StallID, StallName, VendorUserID
            FROM FoodStall
            WHERE StallID = @StallID;
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
                      AND CAST(GETDATE() AS DATE) BETWEEN ra.StartDate AND ra.EndDate
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

// Extend an agreement to a later end date, optionally at a new rental price
async function renewAgreement(agreementId, endDate, rentalPrice) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("AgreementID", sql.Int, agreementId);
        request.input("EndDate", sql.Date, endDate);
        request.input("RentalPrice", sql.Decimal(8, 2), rentalPrice ?? null);

        const result = await request.query(`
            UPDATE RentalAgreement
            SET
                EndDate = @EndDate,
                RentalPrice = ISNULL(@RentalPrice, RentalPrice)
            OUTPUT INSERTED.AgreementID
            WHERE AgreementID = @AgreementID;
        `);

        return result.recordset[0] ? result.recordset[0].AgreementID : null;
    } catch (error) {
        console.error("Database error (renewAgreement):", error);
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
    createAgreement,
    renewAgreement,
};
