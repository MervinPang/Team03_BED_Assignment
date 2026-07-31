// Review Reply Controller - Handles HTTP requests for the vendor's public
// answer to a customer review
const reviewReplyModel = require("../models/reviewReplyModel");

/*
 * Read the review named in the URL and confirm the signed in vendor runs the
 * stall it is about. The stall decides this, not the request, so a vendor can
 * only ever answer for their own counter. Returns null once a response is sent.
 */
async function requireOwnedReview(req, res) {
    const review = await reviewReplyModel.getReviewForReply(
        Number(req.params.reviewId)
    );

    if (!review) {
        res.status(404).json({ error: "Review not found" });
        return null;
    }

    if (Number(review.VendorUserID) !== Number(req.user.id)) {
        res.status(403).json({
            error: "You can only reply to reviews of your own stall",
        });

        return null;
    }

    return review;
}

/*
 * The replies on one stall. This is read by the public reviews page, so it asks
 * for no token and returns nothing a visitor could not already see.
 */
async function getRepliesByStall(req, res) {
    try {
        const stallId = Number(req.params.stallId);

        if (!Number.isInteger(stallId) || stallId <= 0) {
            return res.status(400).json({
                error: "Invalid stall ID. ID must be a positive number",
            });
        }

        const replies = await reviewReplyModel.getRepliesByStallId(stallId);

        return res.status(200).json({
            replyCount: replies.length,
            replies,
        });
    } catch (error) {
        console.error("Controller error (getRepliesByStall):", error);

        return res.status(500).json({
            error: "Unable to retrieve the replies for this stall",
        });
    }
}

/*
 * Every review of the stalls this vendor runs, unanswered ones first, so the
 * reviews still waiting on a reply are the first thing the vendor sees.
 */
async function getMyStallReviews(req, res) {
    try {
        const reviews = await reviewReplyModel.getReviewsForVendor(
            Number(req.user.id)
        );

        return res.status(200).json({
            reviewCount: reviews.length,
            unansweredCount: reviews.filter(review => !review.ReplyID).length,
            reviews,
        });
    } catch (error) {
        console.error("Controller error (getMyStallReviews):", error);

        return res.status(500).json({
            error: "Unable to retrieve the reviews of your stalls",
        });
    }
}

/*
 * Post the vendor's answer, or reword one already posted. A review carries a
 * single reply, so replying again edits that answer rather than leaving two
 * versions of it underneath the same review.
 */
async function saveReply(req, res) {
    try {
        const review = await requireOwnedReview(req, res);

        if (!review) return;

        const existing = await reviewReplyModel.getReplyByReviewId(
            review.ReviewID
        );

        await reviewReplyModel.upsertReply(
            review.ReviewID,
            Number(req.user.id),
            req.body.ReplyText
        );

        const reply = await reviewReplyModel.getReplyByReviewId(review.ReviewID);

        return res.status(existing ? 200 : 201).json({
            message: existing
                ? "Your reply was updated"
                : `Your reply to the review of ${review.StallName} was posted`,
            reply,
        });
    } catch (error) {
        console.error("Controller error (saveReply):", error);

        return res.status(500).json({
            error: "Unable to save your reply",
        });
    }
}

// Take a reply down, leaving the customer's review exactly as they wrote it
async function deleteReply(req, res) {
    try {
        const review = await requireOwnedReview(req, res);

        if (!review) return;

        const replyId = await reviewReplyModel.deleteReply(review.ReviewID);

        if (replyId === null) {
            return res.status(404).json({
                error: "This review has no reply to remove",
            });
        }

        return res.status(200).json({
            message: "Your reply was removed",
            replyId,
        });
    } catch (error) {
        console.error("Controller error (deleteReply):", error);

        return res.status(500).json({
            error: "Unable to remove your reply",
        });
    }
}

module.exports = {
    getRepliesByStall,
    getMyStallReviews,
    saveReply,
    deleteReply,
};
