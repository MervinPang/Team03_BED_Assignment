// orderModel.test.js
// Unit tests for the Place Food Order model

const Order = require("../models/orderModel");
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

// The write paths wrap their statements in a transaction, so the transaction
// and the requests created from it need mocking as well
function mockTransaction() {
    const transaction = {
        begin: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
    };

    const transactionRequest = {
        input: jest.fn(),
        query: jest.fn(),
    };

    sql.Transaction.mockImplementation(() => transaction);
    sql.Request.mockImplementation(() => transactionRequest);

    return { transaction, transactionRequest };
}

describe("orderModel.getAllOrders", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the orders visible to the signed in role", async () => {
        const mockOrders = [
            { OrderID: 1, OrderStatus: "Pending", CustomerName: "mervincustomer" },
            { OrderID: 2, OrderStatus: "Completed", CustomerName: "Guest Lee" },
        ];

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockOrders });

        const orders = await Order.getAllOrders({ id: 5, role: "customer" });

        expect(sql.connect).toHaveBeenCalledWith(expect.any(Object));
        // The role is bound into the query, which is what scopes the result
        expect(mockRequest.input).toHaveBeenCalledWith("UserID", expect.anything(), 5);
        expect(mockRequest.input).toHaveBeenCalledWith(
            "Role",
            expect.anything(),
            "customer"
        );
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(orders).toHaveLength(2);
    });

    it("should handle errors when retrieving the orders", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Order.getAllOrders({ id: 5, role: "customer" })).rejects.toThrow(
            errorMessage
        );
    });
});

describe("orderModel.getOrderById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the order with its items", async () => {
        const order = {
            OrderID: 1,
            OrderType: "Member",
            OrderStatus: "Pending",
            GuestName: null,
            GuestEmail: null,
            GuestOrderReference: null,
        };
        const items = [{ OrderItemID: 1, ItemName: "Chicken Rice", Quantity: 2 }];

        const { connection, mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ recordset: [order] })
            .mockResolvedValueOnce({ recordset: items });

        const result = await Order.getOrderById(1, { id: 5, role: "customer" });

        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(result.OrderID).toBe(1);
        expect(result.items).toEqual(items);
    });

    it("should strip the guest columns from a member order", async () => {
        const order = {
            OrderID: 1,
            OrderType: "Member",
            GuestName: "leftover",
            GuestEmail: "leftover@example.com",
            GuestOrderReference: "GUEST-OLD",
        };

        const { mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ recordset: [order] })
            .mockResolvedValueOnce({ recordset: [] });

        const result = await Order.getOrderById(1, { id: 5, role: "customer" });

        expect(result.GuestName).toBeUndefined();
        expect(result.GuestEmail).toBeUndefined();
        expect(result.GuestOrderReference).toBeUndefined();
    });

    it("should hide the guest reference from a normal read of a guest order", async () => {
        const order = {
            OrderID: 4,
            OrderType: "Guest",
            GuestName: "Guest Lee",
            GuestEmail: "guest@example.com",
            GuestOrderReference: "GUEST-ABC-123",
        };

        const { mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ recordset: [order] })
            .mockResolvedValueOnce({ recordset: [] });

        const result = await Order.getOrderById(4, { id: 5, role: "nea_officer" });

        // The guest keeps their name but the reference is their proof of ownership
        expect(result.GuestName).toBe("Guest Lee");
        expect(result.GuestOrderReference).toBeUndefined();
    });

    it("should return the guest reference right after the order was created", async () => {
        const order = {
            OrderID: 4,
            OrderType: "Guest",
            GuestName: "Guest Lee",
            GuestOrderReference: "GUEST-ABC-123",
        };

        const { mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ recordset: [order] })
            .mockResolvedValueOnce({ recordset: [] });

        const result = await Order.getOrderById(4, null, true);

        expect(result.GuestOrderReference).toBe("GUEST-ABC-123");
    });

    it("should return null when the order is not visible to this user", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValueOnce({ recordset: [] });

        const result = await Order.getOrderById(1, { id: 99, role: "customer" });

        expect(result).toBeNull();
    });

    it("should handle errors when retrieving the order", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            Order.getOrderById(1, { id: 5, role: "customer" })
        ).rejects.toThrow(errorMessage);
    });
});

describe("orderModel.deleteOrder", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should cancel a pending order and commit the transaction", async () => {
        const { connection } = mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [{ OrderID: 1, OrderStatus: "Pending" }],
            }) // ownership
            .mockResolvedValueOnce({ recordset: [] }) // no payment rows
            .mockResolvedValueOnce({ rowsAffected: [1] }) // the update
            .mockResolvedValueOnce({ rowsAffected: [1] }); // the timeline entry

        const deleted = await Order.deleteOrder(1, { id: 5, role: "customer" });

        expect(transaction.begin).toHaveBeenCalledTimes(1);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(deleted).toBe(true);
    });

    it("should return null when the order does not belong to the customer", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({ recordset: [] });

        const deleted = await Order.deleteOrder(1, { id: 99, role: "customer" });

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(deleted).toBeNull();
    });

    it("should refuse to cancel an order that is no longer pending", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [{ OrderID: 1, OrderStatus: "Preparing" }],
        });

        await expect(Order.deleteOrder(1, { id: 5, role: "customer" })).rejects.toThrow(
            "Only pending orders can be cancelled"
        );

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it("should refuse to cancel an order that has already been paid", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [{ OrderID: 1, OrderStatus: "Pending" }],
            })
            .mockResolvedValueOnce({
                recordset: [{ PaymentStatus: "Successful" }],
            });

        await expect(Order.deleteOrder(1, { id: 5, role: "customer" })).rejects.toThrow(
            "Paid orders cannot be cancelled"
        );

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});

describe("orderModel.updateOrderStatus", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should move a pending order to preparing and read it back", async () => {
        const { mockRequest } = mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [{ OrderID: 1, OrderStatus: "Pending" }],
            }) // current status and vendor ownership
            .mockResolvedValueOnce({ rowsAffected: [1] }) // the update
            .mockResolvedValueOnce({ rowsAffected: [1] }); // the timeline entry

        // getOrderById runs after the commit, on the pool rather than the transaction
        mockRequest.query
            .mockResolvedValueOnce({
                recordset: [{ OrderID: 1, OrderType: "Member", OrderStatus: "Preparing" }],
            })
            .mockResolvedValueOnce({ recordset: [] });

        const updated = await Order.updateOrderStatus(1, "Preparing", {
            id: 7,
            role: "vendor",
        });

        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(updated.OrderStatus).toBe("Preparing");
    });

    it("should return null when the order is not assigned to this vendor", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({ recordset: [] });

        const updated = await Order.updateOrderStatus(1, "Preparing", {
            id: 99,
            role: "vendor",
        });

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(updated).toBeNull();
    });

    it("should refuse a status change the workflow does not allow", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [{ OrderID: 1, OrderStatus: "Completed" }],
        });

        await expect(
            Order.updateOrderStatus(1, "Preparing", { id: 7, role: "vendor" })
        ).rejects.toThrow("Order status cannot be changed from Completed to Preparing");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});

describe("orderModel.createOrder", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should price the order from the database and commit the transaction", async () => {
        const { mockRequest } = mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        MenuItemID: 1,
                        ItemPrice: 4.5,
                        IsAvailable: true,
                        StallID: 3,
                        IsActive: true,
                    },
                ],
            }) // the menu item lookup
            .mockResolvedValueOnce({ recordset: [{ OrderID: 10 }] }) // the order
            .mockResolvedValueOnce({ rowsAffected: [1] }) // the first timeline entry
            .mockResolvedValueOnce({ rowsAffected: [1] }); // the order item

        // getOrderById runs after the commit, on the pool rather than the transaction
        mockRequest.query
            .mockResolvedValueOnce({
                recordset: [{ OrderID: 10, OrderType: "Member", OrderStatus: "Pending" }],
            })
            .mockResolvedValueOnce({ recordset: [] });

        const order = await Order.createOrder(
            { OrderType: "Member", items: [{ MenuItemID: 1, Quantity: 2 }] },
            { id: 5, role: "customer" }
        );

        // The total is worked out from the stored price, never from the request
        expect(transactionRequest.input).toHaveBeenCalledWith(
            "TotalAmount",
            expect.anything(),
            9
        );
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(order.OrderID).toBe(10);
    });

    it("should give a guest order a reference the guest can look it up with", async () => {
        const { mockRequest } = mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        MenuItemID: 1,
                        ItemPrice: 5,
                        IsAvailable: true,
                        StallID: 3,
                        IsActive: true,
                    },
                ],
            })
            .mockResolvedValueOnce({ recordset: [{ OrderID: 11 }] })
            .mockResolvedValueOnce({ rowsAffected: [1] })
            .mockResolvedValueOnce({ rowsAffected: [1] });

        mockRequest.query
            .mockResolvedValueOnce({ recordset: [{ OrderID: 11, OrderType: "Guest" }] })
            .mockResolvedValueOnce({ recordset: [] });

        await Order.createOrder(
            {
                OrderType: "Guest",
                GuestName: "Guest Lee",
                GuestEmail: "guest@example.com",
                items: [{ MenuItemID: 1, Quantity: 1 }],
            },
            null
        );

        expect(transactionRequest.input).toHaveBeenCalledWith(
            "GuestOrderReference",
            expect.anything(),
            expect.stringMatching(/^GUEST-/)
        );
    });

    it("should refuse a member order with no authentication", async () => {
        mockConnection();
        mockTransaction();

        await expect(
            Order.createOrder({ OrderType: "Member", items: [] }, null)
        ).rejects.toThrow("Authentication is required for member orders");

        // The check happens before the connection is opened
        expect(sql.connect).not.toHaveBeenCalled();
    });

    it("should refuse a member order from an account that is not a customer", async () => {
        mockConnection();
        mockTransaction();

        await expect(
            Order.createOrder({ OrderType: "Member", items: [] }, { id: 7, role: "vendor" })
        ).rejects.toThrow("Only customers can create member orders");
    });

    it("should refuse a guest order from a signed in account", async () => {
        mockConnection();
        mockTransaction();

        await expect(
            Order.createOrder({ OrderType: "Guest", items: [] }, { id: 5, role: "customer" })
        ).rejects.toThrow("Logged-in users must create member orders");
    });

    it("should roll back when a menu item does not exist", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({ recordset: [] });

        await expect(
            Order.createOrder(
                { OrderType: "Member", items: [{ MenuItemID: 99, Quantity: 1 }] },
                { id: 5, role: "customer" }
            )
        ).rejects.toThrow("Menu item 99 does not exist");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
    });

    it("should refuse an item that is sold out", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [
                {
                    MenuItemID: 1,
                    ItemPrice: 4.5,
                    IsAvailable: false,
                    StallID: 3,
                    IsActive: true,
                },
            ],
        });

        await expect(
            Order.createOrder(
                { OrderType: "Member", items: [{ MenuItemID: 1, Quantity: 1 }] },
                { id: 5, role: "customer" }
            )
        ).rejects.toThrow("Menu item 1 is not available");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it("should refuse an order from a stall that is closed", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [
                {
                    MenuItemID: 1,
                    ItemPrice: 4.5,
                    IsAvailable: true,
                    StallID: 3,
                    IsActive: false,
                },
            ],
        });

        await expect(
            Order.createOrder(
                { OrderType: "Member", items: [{ MenuItemID: 1, Quantity: 1 }] },
                { id: 5, role: "customer" }
            )
        ).rejects.toThrow("The selected food stall is currently unavailable");
    });

    it("should refuse an order that mixes two stalls", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        MenuItemID: 1,
                        ItemPrice: 4.5,
                        IsAvailable: true,
                        StallID: 3,
                        IsActive: true,
                    },
                ],
            })
            .mockResolvedValueOnce({
                recordset: [
                    {
                        MenuItemID: 2,
                        ItemPrice: 5,
                        IsAvailable: true,
                        StallID: 4,
                        IsActive: true,
                    },
                ],
            });

        await expect(
            Order.createOrder(
                {
                    OrderType: "Member",
                    items: [
                        { MenuItemID: 1, Quantity: 1 },
                        { MenuItemID: 2, Quantity: 1 },
                    ],
                },
                { id: 5, role: "customer" }
            )
        ).rejects.toThrow("All items in an order must come from the same food stall");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });
});

describe("orderModel.cancelGuestOrder", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should cancel a pending guest order and keep it in the history", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [{ OrderID: 4, OrderType: "Guest", OrderStatus: "Pending" }],
            }) // the reference is checked against the order
            .mockResolvedValueOnce({ recordset: [] }) // no payment rows
            .mockResolvedValueOnce({ rowsAffected: [1] }) // the status is updated
            .mockResolvedValueOnce({ rowsAffected: [1] }); // the timeline entry

        const cancelled = await Order.cancelGuestOrder(4, "GUEST-ABC-123");

        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(cancelled).toEqual({ OrderID: 4, OrderStatus: "Cancelled" });
    });

    it("should return null when the guest reference does not match", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({ recordset: [] });

        const cancelled = await Order.cancelGuestOrder(4, "WRONG");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(cancelled).toBeNull();
    });

    it("should refuse to cancel a guest order that is no longer pending", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [{ OrderID: 4, OrderType: "Guest", OrderStatus: "Preparing" }],
        });

        await expect(Order.cancelGuestOrder(4, "GUEST-ABC-123")).rejects.toThrow(
            "Only pending guest orders can be cancelled"
        );

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it("should refuse to cancel a guest order that has been paid", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [{ OrderID: 4, OrderType: "Guest", OrderStatus: "Pending" }],
            })
            .mockResolvedValueOnce({ recordset: [{ PaymentStatus: "Successful" }] });

        await expect(Order.cancelGuestOrder(4, "GUEST-ABC-123")).rejects.toThrow(
            "Paid orders cannot be cancelled"
        );
    });

    it("should return null when another request cancelled it first", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [{ OrderID: 4, OrderType: "Guest", OrderStatus: "Pending" }],
            })
            .mockResolvedValueOnce({ recordset: [] })
            .mockResolvedValueOnce({ rowsAffected: [0] }); // the guarded UPDATE matched nothing

        const cancelled = await Order.cancelGuestOrder(4, "GUEST-ABC-123");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(cancelled).toBeNull();
    });
});
