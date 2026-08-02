// orderHistoryController.test.js
// Unit tests for the Order History controller

const orderHistoryController = require("../controllers/orderHistoryController");
const orderHistoryModel = require("../models/orderHistoryModel");

// Mock the Order History model
jest.mock("../models/orderHistoryModel");

function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

describe("orderHistoryController.getActiveOrderHistory", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should fetch the customer's active orders and return a JSON response", async () => {
        const mockOrders = [{ OrderID: 1, OrderStatus: "Preparing" }];

        orderHistoryModel.getActiveOrderHistory.mockResolvedValue(mockOrders);

        const req = { user: { id: 5 } };
        const res = mockResponse();

        await orderHistoryController.getActiveOrderHistory(req, res);

        expect(orderHistoryModel.getActiveOrderHistory).toHaveBeenCalledWith(5);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockOrders);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        orderHistoryModel.getActiveOrderHistory.mockRejectedValue(new Error("Database error"));

        const req = { user: { id: 5 } };
        const res = mockResponse();

        await orderHistoryController.getActiveOrderHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error retrieving active orders" });
    });
});

describe("orderHistoryController.getPreviousOrderHistory", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should fetch the customer's completed and cancelled orders", async () => {
        const mockOrders = [{ OrderID: 2, OrderStatus: "Completed" }];

        orderHistoryModel.getPreviousOrderHistory.mockResolvedValue(mockOrders);

        const req = { user: { id: 5 } };
        const res = mockResponse();

        await orderHistoryController.getPreviousOrderHistory(req, res);

        expect(orderHistoryModel.getPreviousOrderHistory).toHaveBeenCalledWith(5);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockOrders);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        orderHistoryModel.getPreviousOrderHistory.mockRejectedValue(new Error("Database error"));

        const req = { user: { id: 5 } };
        const res = mockResponse();

        await orderHistoryController.getPreviousOrderHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error retrieving previous orders" });
    });
});

describe("orderHistoryController.getMostFrequentOrders", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should fetch the customer's most frequently ordered items", async () => {
        const mockItems = [{ MenuItemID: 1, ItemName: "Chicken Rice", OrderCount: 6 }];

        orderHistoryModel.getMostFrequentOrders.mockResolvedValue(mockItems);

        const req = { user: { id: 5 } };
        const res = mockResponse();

        await orderHistoryController.getMostFrequentOrders(req, res);

        expect(orderHistoryModel.getMostFrequentOrders).toHaveBeenCalledWith(5);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockItems);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        orderHistoryModel.getMostFrequentOrders.mockRejectedValue(new Error("Database error"));

        const req = { user: { id: 5 } };
        const res = mockResponse();

        await orderHistoryController.getMostFrequentOrders(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Error retrieving most frequent orders",
        });
    });
});

describe("orderHistoryController.getOrderHistoryById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the full details of one order", async () => {
        const mockHistory = {
            order: { OrderID: 1 },
            items: [{ OrderItemID: 1 }],
            timeline: [{ OrderStatus: "Pending" }],
        };

        orderHistoryModel.getOrderHistoryById.mockResolvedValue(mockHistory);

        const req = { params: { id: "1" }, user: { id: 5 } };
        const res = mockResponse();

        await orderHistoryController.getOrderHistoryById(req, res);

        expect(orderHistoryModel.getOrderHistoryById).toHaveBeenCalledWith(1, 5);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockHistory);
    });

    it("should return a 400 status for an order ID that is not a positive integer", async () => {
        const req = { params: { id: "-1" }, user: { id: 5 } };
        const res = mockResponse();

        await orderHistoryController.getOrderHistoryById(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Order ID must be a positive integer",
        });
        expect(orderHistoryModel.getOrderHistoryById).not.toHaveBeenCalled();
    });

    it("should return a 404 status when the order belongs to another customer", async () => {
        orderHistoryModel.getOrderHistoryById.mockResolvedValue(null);

        const req = { params: { id: "1" }, user: { id: 5 } };
        const res = mockResponse();

        await orderHistoryController.getOrderHistoryById(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: "Order not found or you do not have access to this order",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        orderHistoryModel.getOrderHistoryById.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "1" }, user: { id: 5 } };
        const res = mockResponse();

        await orderHistoryController.getOrderHistoryById(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Error retrieving order history details",
        });
    });
});

describe("orderHistoryController.getGuestOrderHistory", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return a guest order looked up by its reference", async () => {
        const mockOrder = { order: { OrderID: 4 }, items: [], timeline: [] };

        orderHistoryModel.getGuestOrderHistory.mockResolvedValue(mockOrder);

        const req = { body: { OrderID: 4, GuestOrderReference: "GUEST-ABC-123" } };
        const res = mockResponse();

        await orderHistoryController.getGuestOrderHistory(req, res);

        expect(orderHistoryModel.getGuestOrderHistory).toHaveBeenCalledWith(
            4,
            "GUEST-ABC-123"
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockOrder);
    });

    it("should return a 400 status for an invalid order ID", async () => {
        const req = { body: { OrderID: "abc", GuestOrderReference: "GUEST-1" } };
        const res = mockResponse();

        await orderHistoryController.getGuestOrderHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(orderHistoryModel.getGuestOrderHistory).not.toHaveBeenCalled();
    });

    it("should return a 404 status when the reference does not match", async () => {
        orderHistoryModel.getGuestOrderHistory.mockResolvedValue(null);

        const req = { body: { OrderID: 4, GuestOrderReference: "WRONG" } };
        const res = mockResponse();

        await orderHistoryController.getGuestOrderHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: "Guest order not found or the reference is invalid",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        orderHistoryModel.getGuestOrderHistory.mockRejectedValue(new Error("Database error"));

        const req = { body: { OrderID: 4, GuestOrderReference: "GUEST-1" } };
        const res = mockResponse();

        await orderHistoryController.getGuestOrderHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Error retrieving guest order history",
        });
    });
});
