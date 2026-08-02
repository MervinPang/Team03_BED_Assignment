// stallController.test.js
// Unit tests for the Food Stall and Menu Item browsing controller

const stallController = require("../controllers/stallController");
const stallModel = require("../models/stallModel");

// Mock the Stall model
jest.mock("../models/stallModel");

function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

describe("stallController.getAllStalls", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should fetch all stalls and return a JSON response", async () => {
        const mockStalls = [
            { StallID: 1, StallName: "Ah Hock Chicken Rice" },
            { StallID: 2, StallName: "Tian Tian Laksa" },
        ];

        stallModel.getAllStalls.mockResolvedValue(mockStalls);

        const req = { query: {} };
        const res = mockResponse();

        await stallController.getAllStalls(req, res);

        // With no filters every filter is passed to the model as null
        expect(stallModel.getAllStalls).toHaveBeenCalledWith({
            name: null,
            cuisine: null,
            area: null,
            grade: null,
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockStalls);
    });

    it("should trim the filters and upper case the hygiene grade", async () => {
        stallModel.getAllStalls.mockResolvedValue([]);

        const req = {
            query: { name: "  laksa ", cuisine: " Malay ", area: " Bedok ", grade: "a" },
        };
        const res = mockResponse();

        await stallController.getAllStalls(req, res);

        expect(stallModel.getAllStalls).toHaveBeenCalledWith({
            name: "laksa",
            cuisine: "Malay",
            area: "Bedok",
            grade: "A",
        });
    });

    it("should return a 400 status when the stall name filter is too long", async () => {
        const req = { query: { name: "a".repeat(151) } };
        const res = mockResponse();

        await stallController.getAllStalls(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Stall name search cannot exceed 150 characters",
        });
        expect(stallModel.getAllStalls).not.toHaveBeenCalled();
    });

    it("should return a 400 status for a hygiene grade outside A to D", async () => {
        const req = { query: { grade: "F" } };
        const res = mockResponse();

        await stallController.getAllStalls(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Hygiene grade must be A, B, C, or D",
        });
        expect(stallModel.getAllStalls).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        stallModel.getAllStalls.mockRejectedValue(new Error("Database error"));

        const req = { query: {} };
        const res = mockResponse();

        await stallController.getAllStalls(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve food stalls",
        });
    });
});

describe("stallController.getStallFilterOptions", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the available filter options", async () => {
        const mockOptions = {
            areas: ["Bedok", "Tampines"],
            cuisines: ["Chinese", "Malay"],
            hygieneGrades: ["A", "B", "C", "D"],
        };

        stallModel.getStallFilterOptions.mockResolvedValue(mockOptions);

        const req = {};
        const res = mockResponse();

        await stallController.getStallFilterOptions(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockOptions);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        stallModel.getStallFilterOptions.mockRejectedValue(new Error("Database error"));

        const req = {};
        const res = mockResponse();

        await stallController.getStallFilterOptions(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve stall filter options",
        });
    });
});

describe("stallController.getStallById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return one stall by its ID", async () => {
        const mockStall = { StallID: 1, StallName: "Ah Hock Chicken Rice" };

        stallModel.getStallById.mockResolvedValue(mockStall);

        const req = { params: { id: "1" } };
        const res = mockResponse();

        await stallController.getStallById(req, res);

        expect(stallModel.getStallById).toHaveBeenCalledWith(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockStall);
    });

    it("should return a 400 status for an ID that is not a positive integer", async () => {
        const req = { params: { id: "abc" } };
        const res = mockResponse();

        await stallController.getStallById(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Invalid stall ID. Stall ID must be a positive integer",
        });
        expect(stallModel.getStallById).not.toHaveBeenCalled();
    });

    it("should return a 404 status when the stall does not exist", async () => {
        stallModel.getStallById.mockResolvedValue(null);

        const req = { params: { id: "999" } };
        const res = mockResponse();

        await stallController.getStallById(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Food stall not found" });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        stallModel.getStallById.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "1" } };
        const res = mockResponse();

        await stallController.getStallById(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve the food stall",
        });
    });
});

describe("stallController.getMenuItemsByStallId", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the menu items of an existing stall", async () => {
        const mockItems = [{ MenuItemID: 1, ItemName: "Chicken Rice" }];

        stallModel.getStallById.mockResolvedValue({ StallID: 1 });
        stallModel.getMenuItemsByStallId.mockResolvedValue(mockItems);

        const req = { params: { id: "1" } };
        const res = mockResponse();

        await stallController.getMenuItemsByStallId(req, res);

        expect(stallModel.getMenuItemsByStallId).toHaveBeenCalledWith(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockItems);
    });

    it("should return a 400 status for an invalid stall ID", async () => {
        const req = { params: { id: "-3" } };
        const res = mockResponse();

        await stallController.getMenuItemsByStallId(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(stallModel.getMenuItemsByStallId).not.toHaveBeenCalled();
    });

    it("should return a 404 status when the stall does not exist", async () => {
        stallModel.getStallById.mockResolvedValue(null);

        const req = { params: { id: "999" } };
        const res = mockResponse();

        await stallController.getMenuItemsByStallId(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Food stall not found" });
        expect(stallModel.getMenuItemsByStallId).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        stallModel.getStallById.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "1" } };
        const res = mockResponse();

        await stallController.getMenuItemsByStallId(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve menu items",
        });
    });
});

describe("stallController.getMyVendorStalls", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the stalls assigned to the signed in vendor", async () => {
        const mockStalls = [{ StallID: 3, StallName: "Rayne's Rojak" }];

        stallModel.getStallsByVendorId.mockResolvedValue(mockStalls);

        const req = { user: { id: 7, role: "vendor" } };
        const res = mockResponse();

        await stallController.getMyVendorStalls(req, res);

        // The vendor comes from the token, never from the request body
        expect(stallModel.getStallsByVendorId).toHaveBeenCalledWith(7);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockStalls);
    });

    it("should return an empty list for a vendor who holds no stall yet", async () => {
        stallModel.getStallsByVendorId.mockResolvedValue([]);

        const req = { user: { id: 10, role: "vendor" } };
        const res = mockResponse();

        await stallController.getMyVendorStalls(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should return a 401 status when the token carries no usable user ID", async () => {
        const req = { user: { id: "not-a-number", role: "vendor" } };
        const res = mockResponse();

        await stallController.getMyVendorStalls(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: "Invalid authenticated user",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        stallModel.getStallsByVendorId.mockRejectedValue(new Error("Database error"));

        const req = { user: { id: 7, role: "vendor" } };
        const res = mockResponse();

        await stallController.getMyVendorStalls(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve vendor stalls",
        });
    });
});
