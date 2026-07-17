// Feedback Model - Handles database operations for Submit Feedback (Review table)
const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Check that a food stall exists before accepting feedback for it
async function getStallById(stallId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("StallID", sql.Int, stallId);

        const result = await request.query(`
            SELECT StallID, StallName
            FROM FoodStall
            WHERE StallID = @StallID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getStallById):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Get a single review by its ID 
async function getReviewById(reviewId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("ReviewID", sql.Int, reviewId);

        const result = await request.query(`
            SELECT ReviewID, UserID, StallID, Rating, ReviewComment, ReviewDateTime
            FROM Review
            WHERE ReviewID = @ReviewID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getReviewById):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Create a new review for a food stall
async function createFeedback(feedbackData) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("UserID", sql.Int, feedbackData.UserID);
        request.input("StallID", sql.Int, feedbackData.StallID);
        request.input("Rating", sql.Int, feedbackData.Rating);
        request.input("ReviewComment", sql.VarChar(500), feedbackData.ReviewComment ?? null);

        const result = await request.query(`
            INSERT INTO Review (UserID, StallID, Rating, ReviewComment)
            VALUES (@UserID, @StallID, @Rating, @ReviewComment);

            SELECT SCOPE_IDENTITY() AS ReviewID;
        `);

        const newId = Number(result.recordset[0].ReviewID);

        return await getReviewById(newId);
    } catch (error) {
        console.error("Database error (createFeedback):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Update an existing review
async function updateFeedback(reviewId, feedbackData) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("ReviewID", sql.Int, reviewId);
        request.input("Rating", sql.Int, feedbackData.Rating);
        request.input("ReviewComment", sql.VarChar(500), feedbackData.ReviewComment ?? null);

        const result = await request.query(`
            UPDATE Review
            SET Rating = @Rating,
                ReviewComment = @ReviewComment
            WHERE ReviewID = @ReviewID;
        `);

        if (result.rowsAffected[0] === 0) return null;

        return await getReviewById(reviewId);
    } catch (error) {
        console.error("Database error (updateFeedback):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Delete a review by its ID
async function deleteFeedback(reviewId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("ReviewID", sql.Int, reviewId);

        const result = await request.query(`
            DELETE FROM Review
            WHERE ReviewID = @ReviewID;
        `);

        return result.rowsAffected[0] > 0;
    } catch (error) {
        console.error("Database error (deleteFeedback):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Sort and View Stall Reviews
async function getReviewsByStall(stallId, sort) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        // List of allowed sort options
        const sortOptions = {
            newest: "r.ReviewDateTime DESC",
            oldest: "r.ReviewDateTime ASC",
            highest: "r.Rating DESC",
            lowest: "r.Rating ASC",
        };

        // Use the sort option
        const orderBy = sortOptions[sort] || sortOptions.newest;

        const request = connection.request();
        request.input("StallID", sql.Int, stallId);

        const result = await request.query(`
            SELECT r.ReviewID, r.UserID, ua.Username, r.Rating, r.ReviewComment, r.ReviewDateTime
            FROM Review r
            JOIN UserAccount ua ON r.UserID = ua.UserID
            WHERE r.StallID = @StallID
            ORDER BY ${orderBy};
        `);

        // Get the average rating and total review count for the stall
        const statsRequest = connection.request();
        statsRequest.input("StallID", sql.Int, stallId);

        const statsResult = await statsRequest.query(`
            SELECT AVG(CAST(Rating AS DECIMAL(3,2))) AS AverageRating, COUNT(*) AS ReviewCount
            FROM Review
            WHERE StallID = @StallID;
        `);

        return {
            averageRating: statsResult.recordset[0].AverageRating,
            reviewCount: statsResult.recordset[0].ReviewCount,
            reviews: result.recordset,
        };
    } catch (error) {
        console.error("Database error (getReviewsByStall):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

module.exports = {
    getStallById,
    getReviewById,
    createFeedback,
    updateFeedback,
    deleteFeedback,
    getReviewsByStall,
};