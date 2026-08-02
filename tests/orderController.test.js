// orderController.test.js
// Unit tests for the Place Food Order controller

const orderController = require("../controllers/orderController");
const orderModel = require("../models/orderModel");

// Mock the Order model
jest.mock("../models/orderModel");

function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

describe("orderController.getAllOrders", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should fetch all orders and return a JSON response", async () => {
        const mockOrders = [
            { OrderID: 1, OrderStatus: "Pending" },
            { OrderID: 2, OrderStatus: "Completed" },
        ];

        orderModel.getAllOrders.mockResolvedValue(mockOrders);

        const req = { user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.getAllOrders(req, res);

        // The model decides what the role is allowed to see
        expect(orderModel.getAllOrders).toHaveBeenCalledWith(req.user);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockOrders);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        orderModel.getAllOrders.mockRejectedValue(new Error("Database error"));

        const req = { user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.getAllOrders(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error retrieving orders" });
    });
});

describe("orderController.getOrderById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return one order by its ID", async () => {
        const mockOrder = { OrderID: 1, OrderStatus: "Pending", items: [] };

        orderModel.getOrderById.mockResolvedValue(mockOrder);

        const req = { params: { id: "1" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.getOrderById(req, res);

        expect(orderModel.getOrderById).toHaveBeenCalledWith(1, req.user);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockOrder);
    });

    it("should return a 400 status for an order ID that is not a positive integer", async () => {
        const req = { params: { id: "0" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.getOrderById(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Order ID must be a positive integer",
        });
        expect(orderModel.getOrderById).not.toHaveBeenCalled();
    });

    it("should return a 404 status when the order is not visible to this user", async () => {
        orderModel.getOrderById.mockResolvedValue(null);

        const req = { params: { id: "99" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.getOrderById(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Order not found" });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        orderModel.getOrderById.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "1" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.getOrderById(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error retrieving order" });
    });
});

describe("orderController.createOrder", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should create an order and return a 201 status", async () => {
        const mockOrder = { OrderID: 10, OrderStatus: "Pending" };

        orderModel.createOrder.mockResolvedValue(mockOrder);

        const req = {
            body: { OrderType: "Member", items: [{ MenuItemID: 1, Quantity: 2 }] },
            user: { id: 5, role: "customer" },
        };
        const res = mockResponse();

        await orderController.createOrder(req, res);

        expect(orderModel.createOrder).toHaveBeenCalledWith(req.body, req.user);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(mockOrder);
    });

    it("should turn a business rule error into a 400 status", async () => {
        orderModel.createOrder.mockRejectedValue(
            new Error("All items in an order must come from the same food stall")
        );

        const req = { body: {}, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.createOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "All items in an order must come from the same food stall",
        });
    });

    it("should return a 400 status when a menu item is not available", async () => {
        orderModel.createOrder.mockRejectedValue(
            new Error("Menu item 4 is not available")
        );

        const req = { body: {}, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.createOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return a 401 status when a member order has no authentication", async () => {
        orderModel.createOrder.mockRejectedValue(
            new Error("Authentication is required for member orders")
        );

        const req = { body: { OrderType: "Member" }, user: undefined };
        const res = mockResponse();

        await orderController.createOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: "Authentication is required for member orders",
        });
    });

    it("should return a 403 status when a non customer tries to order", async () => {
        orderModel.createOrder.mockRejectedValue(
            new Error("Only customers can create member orders")
        );

        const req = { body: {}, user: { id: 5, role: "vendor" } };
        const res = mockResponse();

        await orderController.createOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "Only customers can create member orders",
        });
    });

    it("should handle unexpected errors and return a 500 status", async () => {
        orderModel.createOrder.mockRejectedValue(new Error("Database error"));

        const req = { body: {}, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.createOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error creating order" });
    });
});

describe("orderController.updateOrderStatus", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should update the order status and return a 200 status", async () => {
        const mockOrder = { OrderID: 1, OrderStatus: "Preparing" };

        orderModel.updateOrderStatus.mockResolvedValue(mockOrder);

        const req = {
            params: { id: "1" },
            body: { OrderStatus: "Preparing" },
            user: { id: 7, role: "vendor" },
        };
        const res = mockResponse();

        await orderController.updateOrderStatus(req, res);

        expect(orderModel.updateOrderStatus).toHaveBeenCalledWith(1, "Preparing", req.user);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockOrder);
    });

    it("should return a 400 status for an invalid order ID", async () => {
        const req = {
            params: { id: "abc" },
            body: { OrderStatus: "Preparing" },
            user: { id: 7, role: "vendor" },
        };
        const res = mockResponse();

        await orderController.updateOrderStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(orderModel.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("should return a 400 status when the new status is missing", async () => {
        const req = {
            params: { id: "1" },
            body: { OrderStatus: "   " },
            user: { id: 7, role: "vendor" },
        };
        const res = mockResponse();

        await orderController.updateOrderStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "OrderStatus is required" });
    });

    it("should return a 404 status when the order is not assigned to this vendor", async () => {
        orderModel.updateOrderStatus.mockResolvedValue(null);

        const req = {
            params: { id: "1" },
            body: { OrderStatus: "Preparing" },
            user: { id: 7, role: "vendor" },
        };
        const res = mockResponse();

        await orderController.updateOrderStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: "Order not found or not assigned to this vendor",
        });
    });

    it("should return a 409 status for a status change the workflow does not allow", async () => {
        orderModel.updateOrderStatus.mockRejectedValue(
            new Error("Order status cannot be changed from Completed to Preparing")
        );

        const req = {
            params: { id: "1" },
            body: { OrderStatus: "Preparing" },
            user: { id: 7, role: "vendor" },
        };
        const res = mockResponse();

        await orderController.updateOrderStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "Order status cannot be changed from Completed to Preparing",
        });
    });

    it("should return a 403 status when the vendor is not authorised", async () => {
        orderModel.updateOrderStatus.mockRejectedValue(
            new Error("You are not authorised to update this order")
        );

        const req = {
            params: { id: "1" },
            body: { OrderStatus: "Preparing" },
            user: { id: 7, role: "vendor" },
        };
        const res = mockResponse();

        await orderController.updateOrderStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should handle unexpected errors and return a 500 status", async () => {
        orderModel.updateOrderStatus.mockRejectedValue(new Error("Database error"));

        const req = {
            params: { id: "1" },
            body: { OrderStatus: "Preparing" },
            user: { id: 7, role: "vendor" },
        };
        const res = mockResponse();

        await orderController.updateOrderStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to update order status" });
    });
});

describe("orderController.deleteOrder", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should cancel the order and return a 204 status", async () => {
        orderModel.deleteOrder.mockResolvedValue(true);

        const req = { params: { id: "1" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.deleteOrder(req, res);

        expect(orderModel.deleteOrder).toHaveBeenCalledWith(1, req.user);
        expect(res.status).toHaveBeenCalledWith(204);
        expect(res.send).toHaveBeenCalled();
    });

    it("should return a 400 status for an invalid order ID", async () => {
        const req = { params: { id: "1.5" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.deleteOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(orderModel.deleteOrder).not.toHaveBeenCalled();
    });

    it("should return a 404 status when the order does not belong to the customer", async () => {
        orderModel.deleteOrder.mockResolvedValue(null);

        const req = { params: { id: "1" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.deleteOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Order not found" });
    });

    it("should return a 409 status when the order is already paid", async () => {
        orderModel.deleteOrder.mockRejectedValue(new Error("Paid orders cannot be cancelled"));

        const req = { params: { id: "1" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.deleteOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "Paid orders cannot be cancelled",
        });
    });

    it("should handle unexpected errors and return a 500 status", async () => {
        orderModel.deleteOrder.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "1" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await orderController.deleteOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to delete order" });
    });
});

describe("orderController.cancelGuestOrder", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should cancel a guest order and return a 200 status", async () => {
        const cancelled = { OrderID: 4, OrderStatus: "Cancelled" };

        orderModel.cancelGuestOrder.mockResolvedValue(cancelled);

        const req = {
            params: { id: "4" },
            body: { GuestOrderReference: "GUEST-ABC-123" },
        };
        const res = mockResponse();

        await orderController.cancelGuestOrder(req, res);

        expect(orderModel.cancelGuestOrder).toHaveBeenCalledWith(4, "GUEST-ABC-123");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Guest order cancelled successfully",
            order: cancelled,
        });
    });

    it("should return a 400 status for an invalid order ID", async () => {
        const req = { params: { id: "abc" }, body: { GuestOrderReference: "GUEST-1" } };
        const res = mockResponse();

        await orderController.cancelGuestOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(orderModel.cancelGuestOrder).not.toHaveBeenCalled();
    });

    it("should return a 404 status when the guest reference is wrong", async () => {
        orderModel.cancelGuestOrder.mockResolvedValue(null);

        const req = { params: { id: "4" }, body: { GuestOrderReference: "WRONG" } };
        const res = mockResponse();

        await orderController.cancelGuestOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: "Guest order not found or guest order reference is incorrect",
        });
    });

    it("should return a 409 status when the guest order is no longer pending", async () => {
        orderModel.cancelGuestOrder.mockRejectedValue(
            new Error("Only pending guest orders can be cancelled")
        );

        const req = { params: { id: "4" }, body: { GuestOrderReference: "GUEST-1" } };
        const res = mockResponse();

        await orderController.cancelGuestOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("should handle unexpected errors and return a 500 status", async () => {
        orderModel.cancelGuestOrder.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "4" }, body: { GuestOrderReference: "GUEST-1" } };
        const res = mockResponse();

        await orderController.cancelGuestOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to cancel guest order" });
    });
});
