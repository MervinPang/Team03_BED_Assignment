// paymentModel.test.js
// Unit tests for the Checkout and Payment model

const Payment = require("../models/paymentModel");
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

// The write paths wrap their statements in a transaction
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

describe("paymentModel.getAllPayments", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the payments visible to the signed in role", async () => {
        const mockPayments = [
            { PaymentID: 1, PaymentStatus: "Successful", Amount: 12.5 },
            { PaymentID: 2, PaymentStatus: "Pending", Amount: 8 },
        ];

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockPayments });

        const payments = await Payment.getAllPayments({ id: 5, role: "customer" });

        expect(sql.connect).toHaveBeenCalledWith(expect.any(Object));
        expect(mockRequest.input).toHaveBeenCalledWith("UserID", expect.anything(), 5);
        expect(mockRequest.input).toHaveBeenCalledWith(
            "Role",
            expect.anything(),
            "customer"
        );
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(payments).toHaveLength(2);
    });

    it("should handle errors when retrieving the payments", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Payment.getAllPayments({ id: 5, role: "customer" })).rejects.toThrow(
            errorMessage
        );
    });
});

describe("paymentModel.getPaymentById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve one payment by its ID", async () => {
        const mockPayment = { PaymentID: 1, OrderID: 4, Amount: 12.5 };

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [mockPayment] });

        const payment = await Payment.getPaymentById(1, { id: 5, role: "customer" });

        expect(mockRequest.input).toHaveBeenCalledWith("PaymentID", expect.anything(), 1);
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(payment).toEqual(mockPayment);
    });

    it("should return null when the payment is not the caller's to see", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const payment = await Payment.getPaymentById(1, { id: 99, role: "customer" });

        expect(payment).toBeNull();
    });

    it("should handle errors when retrieving the payment", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            Payment.getPaymentById(1, { id: 5, role: "customer" })
        ).rejects.toThrow(errorMessage);
    });
});

describe("paymentModel.getPaymentByOrderId", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the payment recorded against an order", async () => {
        const mockPayment = { PaymentID: 1, OrderID: 4 };

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [mockPayment] });

        const payment = await Payment.getPaymentByOrderId(4, { id: 5, role: "customer" });

        expect(mockRequest.input).toHaveBeenCalledWith("OrderID", expect.anything(), 4);
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(payment).toEqual(mockPayment);
    });

    it("should return null when the order has no payment the caller may see", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const payment = await Payment.getPaymentByOrderId(4, { id: 99, role: "customer" });

        expect(payment).toBeNull();
    });

    it("should handle errors when retrieving the payment", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            Payment.getPaymentByOrderId(4, { id: 5, role: "customer" })
        ).rejects.toThrow(errorMessage);
    });
});

describe("paymentModel.checkAccountAvailability", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should report which of the username and email are already taken", async () => {
        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({
            recordset: [{ UsernameExists: false, EmailExists: true }],
        });

        const availability = await Payment.checkAccountAvailability(
            "newguest",
            "taken@example.com"
        );

        expect(mockRequest.input).toHaveBeenCalledWith(
            "Username",
            expect.anything(),
            "newguest"
        );
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(availability).toEqual({ UsernameExists: false, EmailExists: true });
    });

    it("should turn the bit columns into real booleans", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({
            recordset: [{ UsernameExists: 1, EmailExists: 0 }],
        });

        const availability = await Payment.checkAccountAvailability(
            "taken",
            "free@example.com"
        );

        expect(availability.UsernameExists).toBe(true);
        expect(availability.EmailExists).toBe(false);
    });

    it("should handle errors when checking availability", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            Payment.checkAccountAvailability("newguest", "guest@example.com")
        ).rejects.toThrow(errorMessage);
    });
});

describe("paymentModel.updatePaymentStatus", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should move a pending payment to successful and read it back", async () => {
        const { mockRequest } = mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [{ PaymentID: 1, PaymentStatus: "Pending", PaidAt: null }],
            }) // current status and vendor ownership
            .mockResolvedValueOnce({ rowsAffected: [1] }); // the update

        // getPaymentById runs after the commit, on the pool rather than the transaction
        mockRequest.query.mockResolvedValue({
            recordset: [{ PaymentID: 1, PaymentStatus: "Successful" }],
        });

        const updated = await Payment.updatePaymentStatus(1, "Successful", {
            id: 7,
            role: "vendor",
        });

        expect(transaction.begin).toHaveBeenCalledTimes(1);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(updated.PaymentStatus).toBe("Successful");
    });

    it("should return null when the payment is not the vendor's to change", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({ recordset: [] });

        const updated = await Payment.updatePaymentStatus(1, "Successful", {
            id: 99,
            role: "vendor",
        });

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(updated).toBeNull();
    });

    it("should refuse a status change the rules do not allow", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [{ PaymentID: 1, PaymentStatus: "Refunded" }],
        });

        await expect(
            Payment.updatePaymentStatus(1, "Successful", { id: 7, role: "vendor" })
        ).rejects.toThrow("Payment status cannot be changed from Refunded to Successful");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});

describe("paymentModel.createPayment", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should take the amount from the order and leave a cash payment pending", async () => {
        const { mockRequest } = mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        OrderID: 4,
                        UserID: 5,
                        OrderType: "Member",
                        TotalAmount: 12.5,
                        OrderStatus: "Pending",
                    },
                ],
            }) // the order lookup
            .mockResolvedValueOnce({ recordset: [] }) // no payment exists yet
            .mockResolvedValueOnce({ recordset: [{ PaymentID: 1 }] }); // the payment

        // getCreatedPaymentById runs after the commit, on the pool
        mockRequest.query.mockResolvedValue({
            recordset: [{ PaymentID: 1, PaymentStatus: "Pending", Amount: 12.5 }],
        });

        const payment = await Payment.createPayment(
            { OrderID: 4, PaymentMethod: "Cash" },
            { id: 5, role: "customer" }
        );

        // The payable amount comes from the order, never from the request body
        expect(transactionRequest.input).toHaveBeenCalledWith(
            "Amount",
            expect.anything(),
            12.5
        );
        expect(transactionRequest.input).toHaveBeenCalledWith(
            "PaymentStatus",
            expect.anything(),
            "Pending"
        );
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(payment.AccountCreated).toBe(false);
        expect(payment.Account).toBeNull();
    });

    it("should mark an electronic payment successful straight away", async () => {
        const { mockRequest } = mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        OrderID: 4,
                        UserID: 5,
                        OrderType: "Member",
                        TotalAmount: 12.5,
                        OrderStatus: "Pending",
                    },
                ],
            })
            .mockResolvedValueOnce({ recordset: [] })
            .mockResolvedValueOnce({ recordset: [{ PaymentID: 2 }] });

        mockRequest.query.mockResolvedValue({
            recordset: [{ PaymentID: 2, PaymentStatus: "Successful" }],
        });

        await Payment.createPayment(
            { OrderID: 4, PaymentMethod: "PayNow", TransactionReference: "PN-001" },
            { id: 5, role: "customer" }
        );

        expect(transactionRequest.input).toHaveBeenCalledWith(
            "PaymentStatus",
            expect.anything(),
            "Successful"
        );
    });

    it("should register an account at guest checkout and adopt the order", async () => {
        const { mockRequest } = mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        OrderID: 4,
                        UserID: null,
                        OrderType: "Guest",
                        GuestEmail: "guest@example.com",
                        TotalAmount: 12.5,
                        OrderStatus: "Pending",
                    },
                ],
            }) // the order lookup
            .mockResolvedValueOnce({ recordset: [] }) // no payment exists yet
            .mockResolvedValueOnce({ recordset: [] }) // the name and email are free
            .mockResolvedValueOnce({ recordset: [{ UserID: 20 }] }) // the new account
            .mockResolvedValueOnce({ rowsAffected: [1] }) // the order is adopted
            .mockResolvedValueOnce({ recordset: [{ PaymentID: 3 }] }); // the payment

        mockRequest.query.mockResolvedValue({
            recordset: [{ PaymentID: 3, PaymentStatus: "Successful" }],
        });

        const payment = await Payment.createPayment(
            {
                OrderID: 4,
                PaymentMethod: "Card",
                TransactionReference: "CARD-001",
                GuestOrderReference: "GUEST-ABC-123",
                AccountRegistration: {
                    Username: "newguest",
                    PasswordHash: "hashedPassword",
                },
            },
            null
        );

        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(payment.AccountCreated).toBe(true);
        expect(payment.Account).toEqual({
            UserID: 20,
            Username: "newguest",
            Email: "guest@example.com",
            Role: "customer",
        });
    });

    it("should refuse guest checkout with no guest order reference", async () => {
        mockConnection();
        const { transaction } = mockTransaction();

        await expect(
            Payment.createPayment({ OrderID: 4, PaymentMethod: "Cash" }, null)
        ).rejects.toThrow("Guest order reference is required for guest checkout");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it("should refuse a payment from an account that is not a customer", async () => {
        mockConnection();
        mockTransaction();

        await expect(
            Payment.createPayment({ OrderID: 4, PaymentMethod: "Cash" }, { id: 7, role: "vendor" })
        ).rejects.toThrow("Only customers can create payments");
    });

    it("should refuse account registration from a signed in customer", async () => {
        mockConnection();
        mockTransaction();

        await expect(
            Payment.createPayment(
                {
                    OrderID: 4,
                    PaymentMethod: "Cash",
                    AccountRegistration: { Username: "newguest" },
                },
                { id: 5, role: "customer" }
            )
        ).rejects.toThrow("Account registration is only available for guest checkout");
    });

    it("should refuse a payment for an order the caller cannot reach", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({ recordset: [] });

        await expect(
            Payment.createPayment({ OrderID: 4, PaymentMethod: "Cash" }, { id: 99, role: "customer" })
        ).rejects.toThrow("Order does not exist or you do not have access to this order");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it("should refuse a payment once the order is no longer pending", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [
                {
                    OrderID: 4,
                    UserID: 5,
                    OrderType: "Member",
                    TotalAmount: 12.5,
                    OrderStatus: "Completed",
                },
            ],
        });

        await expect(
            Payment.createPayment({ OrderID: 4, PaymentMethod: "Cash" }, { id: 5, role: "customer" })
        ).rejects.toThrow("Payment can only be made for a pending order");
    });

    it("should refuse a second payment for the same order", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        OrderID: 4,
                        UserID: 5,
                        OrderType: "Member",
                        TotalAmount: 12.5,
                        OrderStatus: "Pending",
                    },
                ],
            })
            .mockResolvedValueOnce({ recordset: [{ PaymentID: 1 }] });

        await expect(
            Payment.createPayment({ OrderID: 4, PaymentMethod: "Cash" }, { id: 5, role: "customer" })
        ).rejects.toThrow("Payment has already been made for this order");
    });

    it("should refuse a username that is already registered", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        OrderID: 4,
                        UserID: null,
                        OrderType: "Guest",
                        GuestEmail: "guest@example.com",
                        TotalAmount: 12.5,
                        OrderStatus: "Pending",
                    },
                ],
            })
            .mockResolvedValueOnce({ recordset: [] })
            .mockResolvedValueOnce({
                recordset: [
                    { UserID: 9, Username: "newguest", Email: "other@example.com" },
                ],
            });

        await expect(
            Payment.createPayment(
                {
                    OrderID: 4,
                    PaymentMethod: "Cash",
                    GuestOrderReference: "GUEST-ABC-123",
                    AccountRegistration: {
                        Username: "newguest",
                        PasswordHash: "hashedPassword",
                    },
                },
                null
            )
        ).rejects.toThrow("Username is already registered");
    });

    it("should refuse an email that is already registered", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        OrderID: 4,
                        UserID: null,
                        OrderType: "Guest",
                        GuestEmail: "guest@example.com",
                        TotalAmount: 12.5,
                        OrderStatus: "Pending",
                    },
                ],
            })
            .mockResolvedValueOnce({ recordset: [] })
            .mockResolvedValueOnce({
                recordset: [
                    { UserID: 9, Username: "somebodyelse", Email: "guest@example.com" },
                ],
            });

        await expect(
            Payment.createPayment(
                {
                    OrderID: 4,
                    PaymentMethod: "Cash",
                    GuestOrderReference: "GUEST-ABC-123",
                    AccountRegistration: {
                        Username: "newguest",
                        PasswordHash: "hashedPassword",
                    },
                },
                null
            )
        ).rejects.toThrow("Email is already registered");
    });
});

describe("paymentModel.updatePaymentMethod", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should switch a pending payment to card and read it back", async () => {
        const { mockRequest } = mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        PaymentID: 1,
                        OrderID: 4,
                        PaymentMethod: "Cash",
                        PaymentStatus: "Pending",
                        OrderStatus: "Pending",
                        UserID: 5,
                    },
                ],
            }) // the payment lookup
            .mockResolvedValueOnce({ recordset: [] }) // the reference is unused
            .mockResolvedValueOnce({ rowsAffected: [1] }); // the update

        mockRequest.query.mockResolvedValue({
            recordset: [{ PaymentID: 1, PaymentMethod: "Card" }],
        });

        const updated = await Payment.updatePaymentMethod(
            1,
            { PaymentMethod: "Card", TransactionReference: "CARD-002" },
            { id: 5, role: "customer" }
        );

        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(updated.PaymentMethod).toBe("Card");
    });

    it("should return null when the payment is not the caller's", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({ recordset: [] });

        const updated = await Payment.updatePaymentMethod(
            1,
            { PaymentMethod: "Card" },
            { id: 99, role: "customer" }
        );

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(updated).toBeNull();
    });

    it("should refuse a change once the order is no longer pending", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [
                {
                    PaymentID: 1,
                    PaymentStatus: "Pending",
                    OrderStatus: "Preparing",
                    UserID: 5,
                },
            ],
        });

        await expect(
            Payment.updatePaymentMethod(1, { PaymentMethod: "Card" }, { id: 5, role: "customer" })
        ).rejects.toThrow("Payment method can only be changed while the order is pending");
    });

    it("should refuse a change to a payment that already succeeded", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [
                {
                    PaymentID: 1,
                    PaymentStatus: "Successful",
                    OrderStatus: "Pending",
                    UserID: 5,
                },
            ],
        });

        await expect(
            Payment.updatePaymentMethod(1, { PaymentMethod: "Card" }, { id: 5, role: "customer" })
        ).rejects.toThrow("Only pending or failed payments can change payment method");
    });

    it("should refuse a transaction reference another payment already used", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        PaymentID: 1,
                        PaymentStatus: "Pending",
                        OrderStatus: "Pending",
                        UserID: 5,
                    },
                ],
            })
            .mockResolvedValueOnce({ recordset: [{ PaymentID: 8 }] });

        await expect(
            Payment.updatePaymentMethod(
                1,
                { PaymentMethod: "Card", TransactionReference: "CARD-002" },
                { id: 5, role: "customer" }
            )
        ).rejects.toThrow("Transaction reference has already been used");
    });
});

describe("paymentModel.deletePayment", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should delete a pending payment on a pending order", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        PaymentID: 1,
                        PaymentStatus: "Pending",
                        OrderID: 4,
                        OrderStatus: "Pending",
                    },
                ],
            })
            .mockResolvedValueOnce({ rowsAffected: [1] });

        const deleted = await Payment.deletePayment(1, { id: 5, role: "customer" });

        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(deleted).toBe(true);
    });

    it("should return null when the payment is not the caller's", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({ recordset: [] });

        const deleted = await Payment.deletePayment(1, { id: 99, role: "customer" });

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(deleted).toBeNull();
    });

    it("should keep a successful payment for the accounting record", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [
                {
                    PaymentID: 1,
                    PaymentStatus: "Successful",
                    OrderID: 4,
                    OrderStatus: "Pending",
                },
            ],
        });

        await expect(
            Payment.deletePayment(1, { id: 5, role: "customer" })
        ).rejects.toThrow("Successful or refunded payments cannot be deleted");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it("should refuse to delete a payment once the order has moved on", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [
                {
                    PaymentID: 1,
                    PaymentStatus: "Pending",
                    OrderID: 4,
                    OrderStatus: "Preparing",
                },
            ],
        });

        await expect(
            Payment.deletePayment(1, { id: 5, role: "customer" })
        ).rejects.toThrow("Payments can only be deleted for pending orders");
    });
});
