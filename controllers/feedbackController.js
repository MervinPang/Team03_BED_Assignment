// Feedback Controller - Handles HTTP requests for Submit Feedback for a Food Stall
const feedbackModel = require("../models/feedbackModel");

// Submit feedback for a food stall for authenticated customers only
async function createFeedback(req, res) {
    try {
        // Check the stall exists before accepting feedback for it
        const stall = await feedbackModel.getStallById(req.body.StallID);
        if (!stall) {
            return res.status(404).json({ error: "Food stall not found" });
        }

        // Customers can only submit feedback as themselves
        const newFeedback = await feedbackModel.createFeedback({
            UserID: req.user.id,
            StallID: req.body.StallID,
            Rating: req.body.Rating,
            ReviewComment: req.body.ReviewComment,
        });

        res.status(201).json({
            message: "Feedback submitted successfully",
            feedback: newFeedback,
        });
    } catch (error) {
        console.error("Controller error (createFeedback):", error);
        res.status(500).json({ error: "Error submitting feedback" });
    }
}

// Update an existing review (owner only)
async function updateFeedback(req, res) {
    try {
        const id = parseInt(req.params.id);

        const review = await feedbackModel.getReviewById(id);
        if (!review) {
            return res.status(404).json({ error: "Review not found" });
        }

        // Users can only update their own reviews
        if (review.UserID !== req.user.id) {
            return res.status(403).json({ error: "You can only update your own reviews" });
        }

        const updatedFeedback = await feedbackModel.updateFeedback(id, {
            Rating: req.body.Rating,
            ReviewComment: req.body.ReviewComment,
        });

        res.json({
            message: "Feedback updated successfully",
            feedback: updatedFeedback,
        });
    } catch (error) {
        console.error("Controller error (updateFeedback):", error);
        res.status(500).json({ error: "Error updating feedback" });
    }
}

// Delete a review (owner only)
async function deleteFeedback(req, res) {
    try {
        const id = parseInt(req.params.id);

        const review = await feedbackModel.getReviewById(id);
        if (!review) {
            return res.status(404).json({ error: "Review not found" });
        }

        // Users can only delete their own reviews
        if (review.UserID !== req.user.id) {
            return res.status(403).json({ error: "You can only delete your own reviews" });
        }

        await feedbackModel.deleteFeedback(id);

        res.status(204).send();
    } catch (error) {
        console.error("Controller error (deleteFeedback):", error);
        res.status(500).json({ error: "Error deleting feedback" });
    }
}

// View all reviews for a stall with sorting
async function getReviewsByStall(req, res) {
    try {
        // Validate the stall ID from the URL
        const stallId = parseInt(req.params.stallId);
        if (isNaN(stallId) || stallId <= 0) {
            return res.status(400).json({ error: "Invalid stall ID. ID must be a positive number" });
        }

        // Validate the sort option 
        const allowedSorts = ["newest", "oldest", "highest", "lowest"];
        if (req.query.sort && !allowedSorts.includes(req.query.sort)) {
            return res.status(400).json({
                error: "Invalid sort option. Use newest, oldest, highest or lowest",
            });
        }

        // Check the stall exists
        const stall = await feedbackModel.getStallById(stallId);
        if (!stall) {
            return res.status(404).json({ error: "Food stall not found" });
        }

        // Get the sorted reviews with the average rating
        const data = await feedbackModel.getReviewsByStall(stallId, req.query.sort);

        res.json({
            stall: stall.StallName,
            averageRating: data.averageRating,
            reviewCount: data.reviewCount,
            reviews: data.reviews,
        });
    } catch (error) {
        console.error("Controller error (getReviewsByStall):", error);
        res.status(500).json({ error: "Error retrieving reviews" });
    }
}

module.exports = {
    createFeedback,
    updateFeedback,
    deleteFeedback,
    getReviewsByStall,
};