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

module.exports = {
    createFeedback,
    updateFeedback,
    deleteFeedback,
};