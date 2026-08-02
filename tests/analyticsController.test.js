// analyticsController.test.js
// Unit tests for the Vendor Sales Analytics controller
//
// This controller queries the database itself instead of going through a model,
// so the mssql library is mocked here in the same way a model test mocks it.

const analyticsController = require("../controllers/analyticsController");
const sql = require("mssql");

jest.mock("mssql"); // Mock the mssql library

function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

// The controller chains .input().input().query(), so input has to return itself
function mockPool() {
    const request = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn(),
    };

    const pool = {
        request: jest.fn().mockReturnValue(request),
    };

    sql.connect.mockResolvedValue(pool);

    return { pool, request };
}

describe("analyticsController.getRevenueAnalytics", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the revenue rows for a stall the vendor owns", async () => {
        const { request } = mockPool();

        const mockRevenue = [
            { RevenueDate: "2026-07-01", TotalRevenue: 250 },
            { RevenueDate: "2026-06-30", TotalRevenue: 180 },
        ];

        request.query
            .mockResolvedValueOnce({ recordset: [{ VendorUserID: 7 }] }) // ownership check
            .mockResolvedValueOnce({ recordset: mockRevenue });

        const req = { params: { stallId: "3" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getRevenueAnalytics(req, res);

        expect(sql.connect).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockRevenue);
    });

    it("should return a 404 status when the stall does not exist", async () => {
        const { request } = mockPool();

        request.query.mockResolvedValueOnce({ recordset: [] });

        const req = { params: { stallId: "999" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getRevenueAnalytics(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Stall does not exist." });
    });

    it("should return a 403 status when the stall belongs to another vendor", async () => {
        const { request } = mockPool();

        request.query.mockResolvedValueOnce({ recordset: [{ VendorUserID: 12 }] });

        const req = { params: { stallId: "3" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getRevenueAnalytics(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "You do not have access to this stall's analytics.",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        sql.connect.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getRevenueAnalytics(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Server error while retrieving revenue analytics.",
        });
    });
});

describe("analyticsController.getOrderVolumeAnalytics", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should total the order counts and return the breakdown", async () => {
        const { request } = mockPool();

        const breakdown = [
            { OrderStatus: "Completed", OrderCount: 8 },
            { OrderStatus: "Cancelled", OrderCount: 2 },
        ];

        request.query
            .mockResolvedValueOnce({ recordset: [{ VendorUserID: 7 }] })
            .mockResolvedValueOnce({ recordset: breakdown });

        const req = { params: { stallId: "3" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getOrderVolumeAnalytics(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            totalOrders: 10,
            breakdown,
        });
    });

    it("should return a 403 status when the stall belongs to another vendor", async () => {
        const { request } = mockPool();

        request.query.mockResolvedValueOnce({ recordset: [{ VendorUserID: 12 }] });

        const req = { params: { stallId: "3" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getOrderVolumeAnalytics(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return a 404 status when the stall does not exist", async () => {
        const { request } = mockPool();

        request.query.mockResolvedValueOnce({ recordset: [] });

        const req = { params: { stallId: "999" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getOrderVolumeAnalytics(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        sql.connect.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getOrderVolumeAnalytics(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Server error while retrieving order volume analytics.",
        });
    });
});

describe("analyticsController.getTopSellingItems", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the best selling items of the stall", async () => {
        const { request } = mockPool();

        const topItems = [
            { MenuItemID: 1, ItemName: "Chicken Rice", TotalQuantitySold: 40 },
        ];

        request.query
            .mockResolvedValueOnce({ recordset: [{ VendorUserID: 7 }] })
            .mockResolvedValueOnce({ recordset: topItems });

        const req = { params: { stallId: "3" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getTopSellingItems(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(topItems);
    });

    it("should return a 403 status when the stall belongs to another vendor", async () => {
        const { request } = mockPool();

        request.query.mockResolvedValueOnce({ recordset: [{ VendorUserID: 12 }] });

        const req = { params: { stallId: "3" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getTopSellingItems(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return a 404 status when the stall does not exist", async () => {
        const { request } = mockPool();

        request.query.mockResolvedValueOnce({ recordset: [] });

        const req = { params: { stallId: "999" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getTopSellingItems(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        sql.connect.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3" }, user: { id: 7 } };
        const res = mockResponse();

        await analyticsController.getTopSellingItems(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Server error while retrieving top-selling items.",
        });
    });
});
