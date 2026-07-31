// Review Reply Model - Handles database operations for the vendor's public
// answer to a customer review
const sql = require("mssql");
const dbConfig = require("../dbConfig");

/*
 * The reply lives in its own table rather than in a column on Review. A review
 * belongs to the customer who wrote it and a reply belongs to the vendor, so
 * keeping them apart means answering a review never rewrites the review itself.
 */

const REPLY_COLUMNS = `
    rr.ReplyID,
    rr.ReviewID,
    rr.VendorUserID,
    rr.ReplyText,
    rr.CreatedAt,
    rr.UpdatedAt,
    vendor.Username AS VendorName,
    r.StallID,
    fs.StallName
`;

const REPLY_JOINS = `
    FROM ReviewReply rr
    JOIN Review r
        ON rr.ReviewID = r.ReviewID
    JOIN FoodStall fs
        ON r.StallID = fs.StallID
    JOIN UserAccount vendor
        ON rr.VendorUserID = vendor.UserID
`;

/*
 * Read the review being answered together with the vendor who runs its stall.
 * That vendor is what decides whether the account replying is allowed to, so it
 * is read from the stall rather than taken from the request.
 */
async function getReviewForReply(reviewId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("ReviewID", sql.Int, reviewId);

        const result = await request.query(`
            SELECT
                r.ReviewID,
                r.UserID AS CustomerUserID,
                r.StallID,
                r.Rating,
                r.ReviewComment,
                r.ReviewDateTime,
                fs.StallName,
                fs.VendorUserID
            FROM Review r
            JOIN FoodStall fs
                ON r.StallID = fs.StallID
            WHERE r.ReviewID = @ReviewID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getReviewForReply):", error);
        throw error;
    }
}

// Every reply on one stall, so the reviews page can show them under the reviews
async function getRepliesByStallId(stallId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("StallID", sql.Int, stallId);

        const result = await request.query(`
            SELECT ${REPLY_COLUMNS}
            ${REPLY_JOINS}
            WHERE r.StallID = @StallID
            ORDER BY rr.CreatedAt DESC;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getRepliesByStallId):", error);
        throw error;
    }
}

async function getReplyByReviewId(reviewId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("ReviewID", sql.Int, reviewId);

        const result = await request.query(`
            SELECT ${REPLY_COLUMNS}
            ${REPLY_JOINS}
            WHERE rr.ReviewID = @ReviewID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getReplyByReviewId):", error);
        throw error;
    }
}

/*
 * Save the vendor's answer. A review carries at most one reply, so replying
 * twice edits the first answer instead of stacking a second one underneath it
 * and UpdatedAt records that the wording changed after it was first posted.
 */
async function upsertReply(reviewId, vendorUserId, replyText) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("ReviewID", sql.Int, reviewId);
        request.input("VendorUserID", sql.Int, vendorUserId);
        request.input("ReplyText", sql.VarChar(500), replyText);

        const result = await request.query(`
            MERGE ReviewReply AS target
            USING (SELECT @ReviewID AS ReviewID) AS source
                ON target.ReviewID = source.ReviewID
            WHEN MATCHED THEN
                UPDATE SET
                    ReplyText = @ReplyText,
                    VendorUserID = @VendorUserID,
                    UpdatedAt = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (ReviewID, VendorUserID, ReplyText)
                VALUES (@ReviewID, @VendorUserID, @ReplyText)
            OUTPUT INSERTED.ReplyID;
        `);

        return result.recordset[0].ReplyID;
    } catch (error) {
        console.error("Database error (upsertReply):", error);
        throw error;
    }
}

// Take a reply down again, leaving the customer's review as it was
async function deleteReply(reviewId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("ReviewID", sql.Int, reviewId);

        const result = await request.query(`
            DELETE FROM ReviewReply
            OUTPUT DELETED.ReplyID
            WHERE ReviewID = @ReviewID;
        `);

        return result.recordset[0] ? result.recordset[0].ReplyID : null;
    } catch (error) {
        console.error("Database error (deleteReply):", error);
        throw error;
    }
}

/*
 * The reviews of the stalls one vendor runs, each with its reply when it has
 * one. This is the list behind the reply workspace on the vendor dashboard, so
 * an unanswered review is easy to find.
 */
async function getReviewsForVendor(vendorUserId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("VendorUserID", sql.Int, vendorUserId);

        const result = await request.query(`
            SELECT
                r.ReviewID,
                r.StallID,
                r.Rating,
                r.ReviewComment,
                r.ReviewDateTime,
                fs.StallName,
                customer.Username AS CustomerName,
                rr.ReplyID,
                rr.ReplyText,
                rr.CreatedAt AS ReplyCreatedAt,
                rr.UpdatedAt AS ReplyUpdatedAt
            FROM Review r
            JOIN FoodStall fs
                ON r.StallID = fs.StallID
            JOIN UserAccount customer
                ON r.UserID = customer.UserID
            LEFT JOIN ReviewReply rr
                ON r.ReviewID = rr.ReviewID
            WHERE fs.VendorUserID = @VendorUserID
            ORDER BY
                CASE WHEN rr.ReplyID IS NULL THEN 0 ELSE 1 END,
                r.ReviewDateTime DESC;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getReviewsForVendor):", error);
        throw error;
    }
}

module.exports = {
    getReviewForReply,
    getRepliesByStallId,
    getReplyByReviewId,
    upsertReply,
    deleteReply,
    getReviewsForVendor,
};
