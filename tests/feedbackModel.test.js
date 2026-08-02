// feedbackModel.test.js
// Unit tests for the Submit Feedback model

const Feedback = require("../models/feedbackModel");
const sql = require("mssql");

jest.mock("mssql"); // Mock the mssql library

function mockConnection() {
    /*
     * mssql exposes its types two ways: sql.Int is handed over as it is, while
     * sql.VarChar(50) is called first. The automock returns undefined from a
     * call, so the ones that are called are given a value here for the
     * assertions on request.input() to match against.
     */
    sql.VarChar.mockReturnValue("VarChar");
    sql.Char.mockReturnValue("Char");
    sql.Decimal.mockReturnValue("Decimal");

    const mockRequest = {
        input: jest.fn(),
        query: jest.fn(),
    };

    const connection = {
        request: jest.fn().mockReturnValue(mockRequest),
        close: jest.fn().mockResolvedValue(undefined),
    };

    sql.connect.mockResolvedValue(connection); // Return the mock connection

    return { connection, mockRequest };
}

describe("feedbackModel.getStallById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should confirm the stall exists before feedback is accepted", async () => {
        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({
            recordset: [{ StallID: 3, StallName: "Tian Tian Laksa" }],
        });

        const stall = await Feedback.getStallById(3);

        expect(sql.connect).toHaveBeenCalledWith(expect.any(Object));
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(stall).toEqual({ StallID: 3, StallName: "Tian Tian Laksa" });
    });

    it("should return null when the stall does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const stall = await Feedback.getStallById(999);

        expect(stall).toBeNull();
    });

    it("should handle errors when reading the stall", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Feedback.getStallById(3)).rejects.toThrow(errorMessage);
    });
});

describe("feedbackModel.getReviewById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve one review by its ID", async () => {
        const mockReview = { ReviewID: 1, UserID: 5, StallID: 3, Rating: 5 };

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [mockReview] });

        const review = await Feedback.getReviewById(1);

        expect(mockRequest.input).toHaveBeenCalledWith("ReviewID", expect.anything(), 1);
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(review).toEqual(mockReview);
    });

    it("should return null when the review does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const review = await Feedback.getReviewById(999);

        expect(review).toBeNull();
    });

    it("should handle errors when reading the review", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Feedback.getReviewById(1)).rejects.toThrow(errorMessage);
    });
});

describe("feedbackModel.createFeedback", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should insert the review and read it back", async () => {
        const newReview = {
            ReviewID: 15,
            UserID: 5,
            StallID: 3,
            Rating: 5,
            ReviewComment: "Very nice",
        };

        const { mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ recordset: [{ ReviewID: 15 }] }) // the insert
            .mockResolvedValueOnce({ recordset: [newReview] }); // getReviewById

        const feedback = await Feedback.createFeedback({
            UserID: 5,
            StallID: 3,
            Rating: 5,
            ReviewComment: "Very nice",
        });

        expect(mockRequest.input).toHaveBeenCalledWith("UserID", expect.anything(), 5);
        expect(mockRequest.input).toHaveBeenCalledWith("Rating", expect.anything(), 5);
        expect(feedback).toEqual(newReview);
    });

    it("should store a missing comment as null", async () => {
        const { mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ recordset: [{ ReviewID: 16 }] })
            .mockResolvedValueOnce({ recordset: [{ ReviewID: 16 }] });

        await Feedback.createFeedback({ UserID: 5, StallID: 3, Rating: 4 });

        expect(mockRequest.input).toHaveBeenCalledWith(
            "ReviewComment",
            expect.anything(),
            null
        );
    });

    it("should handle errors when creating the review", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            Feedback.createFeedback({ UserID: 5, StallID: 3, Rating: 5 })
        ).rejects.toThrow(errorMessage);
    });
});

describe("feedbackModel.updateFeedback", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should update the review and read it back", async () => {
        const updated = { ReviewID: 1, Rating: 4, ReviewComment: "Still good" };

        const { mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ rowsAffected: [1] }) // the update
            .mockResolvedValueOnce({ recordset: [updated] }); // getReviewById

        const feedback = await Feedback.updateFeedback(1, {
            Rating: 4,
            ReviewComment: "Still good",
        });

        expect(feedback).toEqual(updated);
    });

    it("should return null when no row was updated", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValueOnce({ rowsAffected: [0] });

        const feedback = await Feedback.updateFeedback(999, { Rating: 4 });

        expect(feedback).toBeNull();
    });

    it("should handle errors when updating the review", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Feedback.updateFeedback(1, { Rating: 4 })).rejects.toThrow(errorMessage);
    });
});

describe("feedbackModel.deleteFeedback", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should report true when a review was deleted", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ rowsAffected: [1] });

        const deleted = await Feedback.deleteFeedback(1);

        expect(deleted).toBe(true);
    });

    it("should report false when nothing matched", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ rowsAffected: [0] });

        const deleted = await Feedback.deleteFeedback(999);

        expect(deleted).toBe(false);
    });

    it("should handle errors when deleting the review", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Feedback.deleteFeedback(1)).rejects.toThrow(errorMessage);
    });
});

describe("feedbackModel.getReviewsByStall", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the reviews together with the average rating", async () => {
        const reviews = [
            { ReviewID: 1, Rating: 5 },
            { ReviewID: 2, Rating: 4 },
        ];

        const { connection, mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ recordset: reviews }) // the review list
            .mockResolvedValueOnce({
                recordset: [{ AverageRating: 4.5, ReviewCount: 2 }],
            });

        const data = await Feedback.getReviewsByStall(3, "highest");

        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(data).toEqual({
            averageRating: 4.5,
            reviewCount: 2,
            reviews,
        });
    });

    it("should accept an unknown sort option and fall back to newest", async () => {
        const { mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ recordset: [] })
            .mockResolvedValueOnce({
                recordset: [{ AverageRating: null, ReviewCount: 0 }],
            });

        const data = await Feedback.getReviewsByStall(3, undefined);

        // The sort option is looked up in a fixed list, never pasted into the SQL
        expect(mockRequest.query.mock.calls[0][0]).toContain("r.ReviewDateTime DESC");
        expect(data.reviewCount).toBe(0);
    });

    it("should handle errors when retrieving the reviews", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Feedback.getReviewsByStall(3, "newest")).rejects.toThrow(errorMessage);
    });
});
