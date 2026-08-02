// reviewReplyController.test.js
// Unit tests for the vendor's public reply to a customer review

const reviewReplyController = require("../controllers/reviewReplyController");
const reviewReplyModel = require("../models/reviewReplyModel");

// Mock the Review Reply model
jest.mock("../models/reviewReplyModel");

function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

describe("reviewReplyController.getRepliesByStall", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the replies on a stall with a count", async () => {
        const mockReplies = [
            { ReplyID: 1, ReviewID: 4, ReplyText: "Thank you!" },
            { ReplyID: 2, ReviewID: 5, ReplyText: "Sorry about that." },
        ];

        reviewReplyModel.getRepliesByStallId.mockResolvedValue(mockReplies);

        const req = { params: { stallId: "3" } };
        const res = mockResponse();

        await reviewReplyController.getRepliesByStall(req, res);

        expect(reviewReplyModel.getRepliesByStallId).toHaveBeenCalledWith(3);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            replyCount: 2,
            replies: mockReplies,
        });
    });

    it("should return a 400 status for an invalid stall ID", async () => {
        const req = { params: { stallId: "0" } };
        const res = mockResponse();

        await reviewReplyController.getRepliesByStall(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Invalid stall ID. ID must be a positive number",
        });
        expect(reviewReplyModel.getRepliesByStallId).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        reviewReplyModel.getRepliesByStallId.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3" } };
        const res = mockResponse();

        await reviewReplyController.getRepliesByStall(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve the replies for this stall",
        });
    });
});

describe("reviewReplyController.getMyStallReviews", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the vendor's reviews with an unanswered count", async () => {
        const mockReviews = [
            { ReviewID: 1, ReplyID: null },
            { ReviewID: 2, ReplyID: 8 },
            { ReviewID: 3, ReplyID: null },
        ];

        reviewReplyModel.getReviewsForVendor.mockResolvedValue(mockReviews);

        const req = { user: { id: 7 } };
        const res = mockResponse();

        await reviewReplyController.getMyStallReviews(req, res);

        expect(reviewReplyModel.getReviewsForVendor).toHaveBeenCalledWith(7);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            reviewCount: 3,
            unansweredCount: 2,
            reviews: mockReviews,
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        reviewReplyModel.getReviewsForVendor.mockRejectedValue(new Error("Database error"));

        const req = { user: { id: 7 } };
        const res = mockResponse();

        await reviewReplyController.getMyStallReviews(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve the reviews of your stalls",
        });
    });
});

describe("reviewReplyController.saveReply", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should post a new reply and return a 201 status", async () => {
        const mockReview = { ReviewID: 4, VendorUserID: 7, StallName: "Rayne's Rojak" };
        const mockReply = { ReplyID: 9, ReviewID: 4, ReplyText: "Thank you!" };

        reviewReplyModel.getReviewForReply.mockResolvedValue(mockReview);
        // No reply exists yet, so the answer is created rather than edited
        reviewReplyModel.getReplyByReviewId
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(mockReply);
        reviewReplyModel.upsertReply.mockResolvedValue(9);

        const req = {
            params: { reviewId: "4" },
            user: { id: 7 },
            body: { ReplyText: "Thank you!" },
        };
        const res = mockResponse();

        await reviewReplyController.saveReply(req, res);

        expect(reviewReplyModel.upsertReply).toHaveBeenCalledWith(4, 7, "Thank you!");
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            message: "Your reply to the review of Rayne's Rojak was posted",
            reply: mockReply,
        });
    });

    it("should edit an existing reply and return a 200 status", async () => {
        const mockReview = { ReviewID: 4, VendorUserID: 7, StallName: "Rayne's Rojak" };
        const existingReply = { ReplyID: 9, ReviewID: 4, ReplyText: "Thanks" };
        const updatedReply = { ReplyID: 9, ReviewID: 4, ReplyText: "Thank you!" };

        reviewReplyModel.getReviewForReply.mockResolvedValue(mockReview);
        reviewReplyModel.getReplyByReviewId
            .mockResolvedValueOnce(existingReply)
            .mockResolvedValueOnce(updatedReply);
        reviewReplyModel.upsertReply.mockResolvedValue(9);

        const req = {
            params: { reviewId: "4" },
            user: { id: 7 },
            body: { ReplyText: "Thank you!" },
        };
        const res = mockResponse();

        await reviewReplyController.saveReply(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Your reply was updated",
            reply: updatedReply,
        });
    });

    it("should return a 404 status when the review does not exist", async () => {
        reviewReplyModel.getReviewForReply.mockResolvedValue(null);

        const req = {
            params: { reviewId: "99" },
            user: { id: 7 },
            body: { ReplyText: "Thank you!" },
        };
        const res = mockResponse();

        await reviewReplyController.saveReply(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Review not found" });
        expect(reviewReplyModel.upsertReply).not.toHaveBeenCalled();
    });

    it("should return a 403 status when the review is about another vendor's stall", async () => {
        // The stall decides who may reply, not the request
        reviewReplyModel.getReviewForReply.mockResolvedValue({
            ReviewID: 4,
            VendorUserID: 12,
            StallName: "Someone Else's Stall",
        });

        const req = {
            params: { reviewId: "4" },
            user: { id: 7 },
            body: { ReplyText: "Thank you!" },
        };
        const res = mockResponse();

        await reviewReplyController.saveReply(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "You can only reply to reviews of your own stall",
        });
        expect(reviewReplyModel.upsertReply).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        reviewReplyModel.getReviewForReply.mockRejectedValue(new Error("Database error"));

        const req = {
            params: { reviewId: "4" },
            user: { id: 7 },
            body: { ReplyText: "Thank you!" },
        };
        const res = mockResponse();

        await reviewReplyController.saveReply(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Unable to save your reply" });
    });
});

describe("reviewReplyController.deleteReply", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should take the reply down and return a 200 status", async () => {
        reviewReplyModel.getReviewForReply.mockResolvedValue({
            ReviewID: 4,
            VendorUserID: 7,
            StallName: "Rayne's Rojak",
        });
        reviewReplyModel.deleteReply.mockResolvedValue(9);

        const req = { params: { reviewId: "4" }, user: { id: 7 } };
        const res = mockResponse();

        await reviewReplyController.deleteReply(req, res);

        expect(reviewReplyModel.deleteReply).toHaveBeenCalledWith(4);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Your reply was removed",
            replyId: 9,
        });
    });

    it("should return a 404 status when the review has no reply to remove", async () => {
        reviewReplyModel.getReviewForReply.mockResolvedValue({
            ReviewID: 4,
            VendorUserID: 7,
            StallName: "Rayne's Rojak",
        });
        reviewReplyModel.deleteReply.mockResolvedValue(null);

        const req = { params: { reviewId: "4" }, user: { id: 7 } };
        const res = mockResponse();

        await reviewReplyController.deleteReply(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: "This review has no reply to remove",
        });
    });

    it("should return a 403 status when the review is about another vendor's stall", async () => {
        reviewReplyModel.getReviewForReply.mockResolvedValue({
            ReviewID: 4,
            VendorUserID: 12,
            StallName: "Someone Else's Stall",
        });

        const req = { params: { reviewId: "4" }, user: { id: 7 } };
        const res = mockResponse();

        await reviewReplyController.deleteReply(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(reviewReplyModel.deleteReply).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        reviewReplyModel.getReviewForReply.mockRejectedValue(new Error("Database error"));

        const req = { params: { reviewId: "4" }, user: { id: 7 } };
        const res = mockResponse();

        await reviewReplyController.deleteReply(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Unable to remove your reply" });
    });
});
