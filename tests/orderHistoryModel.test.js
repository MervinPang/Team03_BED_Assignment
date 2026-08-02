// orderHistoryModel.test.js
// Unit tests for the Order History model

const OrderHistory = require("../models/orderHistoryModel");
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

describe("orderHistoryModel.getActiveOrderHistory", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the customer's pending, preparing and ready orders", async () => {
        const mockOrders = [
            { OrderID: 1, OrderStatus: "Preparing", TotalQuantity: 3 },
            { OrderID: 2, OrderStatus: "Ready", TotalQuantity: 1 },
        ];

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockOrders });

        const orders = await OrderHistory.getActiveOrderHistory(5);

        expect(mockRequest.input).toHaveBeenCalledWith("UserID", expect.anything(), 5);
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(orders).toHaveLength(2);
    });

    it("should handle errors when retrieving the active orders", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(OrderHistory.getActiveOrderHistory(5)).rejects.toThrow(errorMessage);
    });
});

describe("orderHistoryModel.getPreviousOrderHistory", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the customer's completed and cancelled orders", async () => {
        const mockOrders = [{ OrderID: 3, OrderStatus: "Completed" }];

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockOrders });

        const orders = await OrderHistory.getPreviousOrderHistory(5);

        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(orders).toEqual(mockOrders);
    });

    it("should handle errors when retrieving the previous orders", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(OrderHistory.getPreviousOrderHistory(5)).rejects.toThrow(errorMessage);
    });
});

describe("orderHistoryModel.getMostFrequentOrders", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the customer's most frequently ordered items", async () => {
        const mockItems = [
            { MenuItemID: 1, ItemName: "Chicken Rice", TotalQuantityOrdered: 12 },
        ];

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockItems });

        const items = await OrderHistory.getMostFrequentOrders(5);

        expect(mockRequest.input).toHaveBeenCalledWith("UserID", expect.anything(), 5);
        expect(items).toEqual(mockItems);
    });

    it("should handle errors when retrieving the most frequent orders", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(OrderHistory.getMostFrequentOrders(5)).rejects.toThrow(errorMessage);
    });
});

describe("orderHistoryModel.getOrderHistoryById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the order with its items and its status timeline", async () => {
        const order = { OrderID: 1, OrderStatus: "Completed" };
        const items = [{ OrderItemID: 1, ItemName: "Chicken Rice", Quantity: 2 }];
        const timeline = [
            { OrderStatus: "Pending" },
            { OrderStatus: "Preparing" },
            { OrderStatus: "Completed" },
        ];

        const { connection, mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ recordset: [order] })
            .mockResolvedValueOnce({ recordset: items })
            .mockResolvedValueOnce({ recordset: timeline });

        const history = await OrderHistory.getOrderHistoryById(1, 5);

        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(history).toEqual({ order, items, timeline });
    });

    it("should return null when the order belongs to another customer", async () => {
        // The customer is part of the WHERE clause, so it matches nothing
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValueOnce({ recordset: [] });

        const history = await OrderHistory.getOrderHistoryById(1, 99);

        expect(history).toBeNull();
        expect(mockRequest.query).toHaveBeenCalledTimes(1);
    });

    it("should handle errors when retrieving the order details", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(OrderHistory.getOrderHistoryById(1, 5)).rejects.toThrow(errorMessage);
    });
});

describe("orderHistoryModel.getGuestOrderHistory", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the guest order when the reference matches", async () => {
        const order = { OrderID: 4, GuestOrderReference: "GUEST-ABC-123" };
        const items = [{ MenuItemID: 1, ItemName: "Laksa", Quantity: 1 }];
        const timeline = [{ OrderStatus: "Pending" }];

        const { connection, mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ recordset: [order] })
            .mockResolvedValueOnce({ recordset: items })
            .mockResolvedValueOnce({ recordset: timeline });

        const history = await OrderHistory.getGuestOrderHistory(4, "GUEST-ABC-123");

        expect(mockRequest.input).toHaveBeenCalledWith(
            "GuestOrderReference",
            expect.anything(),
            "GUEST-ABC-123"
        );
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(history).toEqual({ order, items, timeline });
    });

    it("should return null when the reference is wrong", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValueOnce({ recordset: [] });

        const history = await OrderHistory.getGuestOrderHistory(4, "WRONG");

        expect(history).toBeNull();
    });

    it("should handle errors when retrieving the guest order", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            OrderHistory.getGuestOrderHistory(4, "GUEST-ABC-123")
        ).rejects.toThrow(errorMessage);
    });
});
