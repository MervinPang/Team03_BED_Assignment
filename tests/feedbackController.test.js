// feedbackController.test.js
// Unit tests for the Submit Feedback for a Food Stall controller

const feedbackController = require("../controllers/feedbackController");
const feedbackModel = require("../models/feedbackModel");

// Mock the Feedback model
jest.mock("../models/feedbackModel");

function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

describe("feedbackController.createFeedback", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should submit feedback and return a 201 status", async () => {
        const mockFeedback = {
            ReviewID: 1,
            UserID: 5,
            StallID: 3,
            Rating: 5,
            ReviewComment: "Very nice",
        };

        feedbackModel.getStallById.mockResolvedValue({ StallID: 3, StallName: "Laksa" });
        feedbackModel.createFeedback.mockResolvedValue(mockFeedback);

        const req = {
            user: { id: 5 },
            body: { StallID: 3, Rating: 5, ReviewComment: "Very nice" },
        };
        const res = mockResponse();

        await feedbackController.createFeedback(req, res);

        // The customer is taken from the token so nobody can review as somebody else
        expect(feedbackModel.createFeedback).toHaveBeenCalledWith({
            UserID: 5,
            StallID: 3,
            Rating: 5,
            ReviewComment: "Very nice",
        });
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            message: "Feedback submitted successfully",
            feedback: mockFeedback,
        });
    });

    it("should return a 404 status when the stall does not exist", async () => {
        feedbackModel.getStallById.mockResolvedValue(null);

        const req = { user: { id: 5 }, body: { StallID: 999, Rating: 5 } };
        const res = mockResponse();

        await feedbackController.createFeedback(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Food stall not found" });
        expect(feedbackModel.createFeedback).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        feedbackModel.getStallById.mockRejectedValue(new Error("Database error"));

        const req = { user: { id: 5 }, body: { StallID: 3, Rating: 5 } };
        const res = mockResponse();

        await feedbackController.createFeedback(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error submitting feedback" });
    });
});

describe("feedbackController.updateFeedback", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should update the customer's own review", async () => {
        const updated = { ReviewID: 1, Rating: 4, ReviewComment: "Still good" };

        feedbackModel.getReviewById.mockResolvedValue({ ReviewID: 1, UserID: 5 });
        feedbackModel.updateFeedback.mockResolvedValue(updated);

        const req = {
            params: { id: "1" },
            user: { id: 5 },
            body: { Rating: 4, ReviewComment: "Still good" },
        };
        const res = mockResponse();

        await feedbackController.updateFeedback(req, res);

        expect(feedbackModel.updateFeedback).toHaveBeenCalledWith(1, {
            Rating: 4,
            ReviewComment: "Still good",
        });
        expect(res.json).toHaveBeenCalledWith({
            message: "Feedback updated successfully",
            feedback: updated,
        });
    });

    it("should return a 404 status when the review does not exist", async () => {
        feedbackModel.getReviewById.mockResolvedValue(null);

        const req = { params: { id: "999" }, user: { id: 5 }, body: { Rating: 4 } };
        const res = mockResponse();

        await feedbackController.updateFeedback(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Review not found" });
    });

    it("should return a 403 status when the review belongs to another customer", async () => {
        feedbackModel.getReviewById.mockResolvedValue({ ReviewID: 1, UserID: 12 });

        const req = { params: { id: "1" }, user: { id: 5 }, body: { Rating: 4 } };
        const res = mockResponse();

        await feedbackController.updateFeedback(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "You can only update your own reviews",
        });
        expect(feedbackModel.updateFeedback).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        feedbackModel.getReviewById.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "1" }, user: { id: 5 }, body: { Rating: 4 } };
        const res = mockResponse();

        await feedbackController.updateFeedback(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error updating feedback" });
    });
});

describe("feedbackController.deleteFeedback", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should delete the customer's own review and return a 204 status", async () => {
        feedbackModel.getReviewById.mockResolvedValue({ ReviewID: 1, UserID: 5 });
        feedbackModel.deleteFeedback.mockResolvedValue(true);

        const req = { params: { id: "1" }, user: { id: 5 } };
        const res = mockResponse();

        await feedbackController.deleteFeedback(req, res);

        expect(feedbackModel.deleteFeedback).toHaveBeenCalledWith(1);
        expect(res.status).toHaveBeenCalledWith(204);
        expect(res.send).toHaveBeenCalled();
    });

    it("should return a 404 status when the review does not exist", async () => {
        feedbackModel.getReviewById.mockResolvedValue(null);

        const req = { params: { id: "999" }, user: { id: 5 } };
        const res = mockResponse();

        await feedbackController.deleteFeedback(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(feedbackModel.deleteFeedback).not.toHaveBeenCalled();
    });

    it("should return a 403 status when the review belongs to another customer", async () => {
        feedbackModel.getReviewById.mockResolvedValue({ ReviewID: 1, UserID: 12 });

        const req = { params: { id: "1" }, user: { id: 5 } };
        const res = mockResponse();

        await feedbackController.deleteFeedback(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "You can only delete your own reviews",
        });
        expect(feedbackModel.deleteFeedback).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        feedbackModel.getReviewById.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "1" }, user: { id: 5 } };
        const res = mockResponse();

        await feedbackController.deleteFeedback(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error deleting feedback" });
    });
});

describe("feedbackController.getReviewsByStall", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the reviews of a stall with the average rating", async () => {
        feedbackModel.getStallById.mockResolvedValue({
            StallID: 3,
            StallName: "Tian Tian Laksa",
        });
        feedbackModel.getReviewsByStall.mockResolvedValue({
            averageRating: 4.5,
            reviewCount: 2,
            reviews: [{ ReviewID: 1 }, { ReviewID: 2 }],
        });

        const req = { params: { stallId: "3" }, query: { sort: "highest" } };
        const res = mockResponse();

        await feedbackController.getReviewsByStall(req, res);

        expect(feedbackModel.getReviewsByStall).toHaveBeenCalledWith(3, "highest");
        expect(res.json).toHaveBeenCalledWith({
            stall: "Tian Tian Laksa",
            averageRating: 4.5,
            reviewCount: 2,
            reviews: [{ ReviewID: 1 }, { ReviewID: 2 }],
        });
    });

    it("should return a 400 status for an invalid stall ID", async () => {
        const req = { params: { stallId: "abc" }, query: {} };
        const res = mockResponse();

        await feedbackController.getReviewsByStall(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Invalid stall ID. ID must be a positive number",
        });
    });

    it("should return a 400 status for an unknown sort option", async () => {
        const req = { params: { stallId: "3" }, query: { sort: "cheapest" } };
        const res = mockResponse();

        await feedbackController.getReviewsByStall(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Invalid sort option. Use newest, oldest, highest or lowest",
        });
        expect(feedbackModel.getReviewsByStall).not.toHaveBeenCalled();
    });

    it("should return a 404 status when the stall does not exist", async () => {
        feedbackModel.getStallById.mockResolvedValue(null);

        const req = { params: { stallId: "999" }, query: {} };
        const res = mockResponse();

        await feedbackController.getReviewsByStall(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Food stall not found" });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        feedbackModel.getStallById.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3" }, query: {} };
        const res = mockResponse();

        await feedbackController.getReviewsByStall(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error retrieving reviews" });
    });
});
