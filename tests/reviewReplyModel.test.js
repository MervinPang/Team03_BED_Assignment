// reviewReplyModel.test.js
// Unit tests for the vendor reply model

const ReviewReply = require("../models/reviewReplyModel");
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

describe("reviewReplyModel.getReviewForReply", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should read the review together with the vendor who runs its stall", async () => {
        const mockReview = {
            ReviewID: 4,
            StallID: 3,
            StallName: "Rayne's Rojak",
            VendorUserID: 7,
        };

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [mockReview] });

        const review = await ReviewReply.getReviewForReply(4);

        expect(mockRequest.input).toHaveBeenCalledWith("ReviewID", expect.anything(), 4);
        // The pool is shared by the whole application and is left open here
        expect(connection.close).not.toHaveBeenCalled();
        expect(review).toEqual(mockReview);
    });

    it("should return null when the review does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const review = await ReviewReply.getReviewForReply(999);

        expect(review).toBeNull();
    });

    it("should handle errors when reading the review", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(ReviewReply.getReviewForReply(4)).rejects.toThrow(errorMessage);
    });
});

describe("reviewReplyModel.getRepliesByStallId", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve every reply on one stall", async () => {
        const mockReplies = [
            { ReplyID: 1, ReviewID: 4, ReplyText: "Thank you!" },
            { ReplyID: 2, ReviewID: 5, ReplyText: "Sorry about that." },
        ];

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockReplies });

        const replies = await ReviewReply.getRepliesByStallId(3);

        expect(mockRequest.input).toHaveBeenCalledWith("StallID", expect.anything(), 3);
        expect(replies).toHaveLength(2);
    });

    it("should handle errors when retrieving the replies", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(ReviewReply.getRepliesByStallId(3)).rejects.toThrow(errorMessage);
    });
});

describe("reviewReplyModel.getReplyByReviewId", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the reply on one review", async () => {
        const mockReply = { ReplyID: 9, ReviewID: 4, ReplyText: "Thank you!" };

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [mockReply] });

        const reply = await ReviewReply.getReplyByReviewId(4);

        expect(reply).toEqual(mockReply);
    });

    it("should return null when the review has not been answered", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const reply = await ReviewReply.getReplyByReviewId(4);

        expect(reply).toBeNull();
    });

    it("should handle errors when reading the reply", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(ReviewReply.getReplyByReviewId(4)).rejects.toThrow(errorMessage);
    });
});

describe("reviewReplyModel.upsertReply", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should save the reply and return its ID", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [{ ReplyID: 9 }] });

        const replyId = await ReviewReply.upsertReply(4, 7, "Thank you!");

        expect(mockRequest.input).toHaveBeenCalledWith("ReviewID", expect.anything(), 4);
        expect(mockRequest.input).toHaveBeenCalledWith(
            "VendorUserID",
            expect.anything(),
            7
        );
        expect(mockRequest.input).toHaveBeenCalledWith(
            "ReplyText",
            expect.anything(),
            "Thank you!"
        );
        expect(replyId).toBe(9);
    });

    it("should handle errors when saving the reply", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(ReviewReply.upsertReply(4, 7, "Thank you!")).rejects.toThrow(
            errorMessage
        );
    });
});

describe("reviewReplyModel.deleteReply", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the ID of the reply it removed", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [{ ReplyID: 9 }] });

        const replyId = await ReviewReply.deleteReply(4);

        expect(replyId).toBe(9);
    });

    it("should return null when the review had no reply", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const replyId = await ReviewReply.deleteReply(4);

        expect(replyId).toBeNull();
    });

    it("should handle errors when removing the reply", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(ReviewReply.deleteReply(4)).rejects.toThrow(errorMessage);
    });
});

describe("reviewReplyModel.getReviewsForVendor", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve every review of the stalls a vendor runs", async () => {
        const mockReviews = [
            { ReviewID: 1, ReplyID: null },
            { ReviewID: 2, ReplyID: 9 },
        ];

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockReviews });

        const reviews = await ReviewReply.getReviewsForVendor(7);

        expect(mockRequest.input).toHaveBeenCalledWith(
            "VendorUserID",
            expect.anything(),
            7
        );
        expect(reviews).toEqual(mockReviews);
    });

    it("should handle errors when retrieving the reviews", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(ReviewReply.getReviewsForVendor(7)).rejects.toThrow(errorMessage);
    });
});
