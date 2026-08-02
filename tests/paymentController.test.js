// paymentController.test.js
// Unit tests for the Checkout and Payment controller

const paymentController = require("../controllers/paymentController");
const paymentModel = require("../models/paymentModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Mock the Payment model
jest.mock("../models/paymentModel");
jest.mock("bcrypt");
jest.mock("jsonwebtoken");

function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

describe("paymentController.getAllPayments", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should fetch all payments and return a JSON response", async () => {
        const mockPayments = [{ PaymentID: 1, PaymentStatus: "Successful" }];

        paymentModel.getAllPayments.mockResolvedValue(mockPayments);

        const req = { user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.getAllPayments(req, res);

        expect(paymentModel.getAllPayments).toHaveBeenCalledWith(req.user);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockPayments);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        paymentModel.getAllPayments.mockRejectedValue(new Error("Database error"));

        const req = { user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.getAllPayments(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error retrieving payments" });
    });
});

describe("paymentController.getPaymentById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return one payment by its ID", async () => {
        const mockPayment = { PaymentID: 1, Amount: 12.5 };

        paymentModel.getPaymentById.mockResolvedValue(mockPayment);

        const req = { params: { id: "1" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.getPaymentById(req, res);

        expect(paymentModel.getPaymentById).toHaveBeenCalledWith(1, req.user);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockPayment);
    });

    it("should return a 400 status for a payment ID that is not a positive integer", async () => {
        const req = { params: { id: "0" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.getPaymentById(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Payment ID must be a positive integer",
        });
        expect(paymentModel.getPaymentById).not.toHaveBeenCalled();
    });

    it("should return a 404 status when the payment is not visible to this user", async () => {
        paymentModel.getPaymentById.mockResolvedValue(null);

        const req = { params: { id: "99" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.getPaymentById(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Payment not found" });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        paymentModel.getPaymentById.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "1" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.getPaymentById(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error retrieving payment" });
    });
});

describe("paymentController.getPaymentByOrderId", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the payment recorded against an order", async () => {
        const mockPayment = { PaymentID: 1, OrderID: 4 };

        paymentModel.getPaymentByOrderId.mockResolvedValue(mockPayment);

        const req = { params: { orderId: "4" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.getPaymentByOrderId(req, res);

        expect(paymentModel.getPaymentByOrderId).toHaveBeenCalledWith(4, req.user);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(mockPayment);
    });

    it("should return a 400 status for an invalid order ID", async () => {
        const req = { params: { orderId: "abc" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.getPaymentByOrderId(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(paymentModel.getPaymentByOrderId).not.toHaveBeenCalled();
    });

    it("should return a 404 status when the order has no payment", async () => {
        paymentModel.getPaymentByOrderId.mockResolvedValue(null);

        const req = { params: { orderId: "4" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.getPaymentByOrderId(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: "Payment not found for this order",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        paymentModel.getPaymentByOrderId.mockRejectedValue(new Error("Database error"));

        const req = { params: { orderId: "4" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.getPaymentByOrderId(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Error retrieving payment by order ID",
        });
    });
});

describe("paymentController.checkAccountAvailability", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should report a free username and a taken email", async () => {
        paymentModel.checkAccountAvailability.mockResolvedValue({
            UsernameExists: false,
            EmailExists: true,
        });

        const req = { body: { Username: "newguest", Email: "taken@example.com" } };
        const res = mockResponse();

        await paymentController.checkAccountAvailability(req, res);

        expect(paymentModel.checkAccountAvailability).toHaveBeenCalledWith(
            "newguest",
            "taken@example.com"
        );
        // The controller answers with availability, which is the opposite of existence
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            UsernameAvailable: true,
            EmailAvailable: false,
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        paymentModel.checkAccountAvailability.mockRejectedValue(new Error("Database error"));

        const req = { body: { Username: "newguest", Email: "guest@example.com" } };
        const res = mockResponse();

        await paymentController.checkAccountAvailability(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to check account availability",
        });
    });
});

describe("paymentController.createPayment", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.JWT_SECRET = "test-secret";
    });

    it("should create a payment and return a 201 status", async () => {
        const mockPayment = { PaymentID: 1, PaymentStatus: "Successful" };

        paymentModel.createPayment.mockResolvedValue(mockPayment);

        const req = {
            body: { OrderID: 4, PaymentMethod: "PayNow", Amount: 12.5 },
            user: { id: 5, role: "customer" },
        };
        const res = mockResponse();

        await paymentController.createPayment(req, res);

        expect(paymentModel.createPayment).toHaveBeenCalledWith(req.body, req.user);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(mockPayment);
    });

    it("should hash the password and issue a token when an account is registered at checkout", async () => {
        bcrypt.genSalt.mockResolvedValue("salt");
        bcrypt.hash.mockResolvedValue("hashedPassword");
        jwt.sign.mockReturnValue("signed.jwt.token");

        paymentModel.createPayment.mockResolvedValue({
            PaymentID: 1,
            AccountCreated: true,
            Account: {
                UserID: 20,
                Username: "newguest",
                Email: "guest@example.com",
                Role: "customer",
            },
        });

        const req = {
            body: {
                OrderID: 4,
                PaymentMethod: "Card",
                AccountRegistration: {
                    Username: "newguest",
                    Email: "guest@example.com",
                    Password: "Password123!",
                },
            },
            user: undefined,
        };
        const res = mockResponse();

        await paymentController.createPayment(req, res);

        expect(bcrypt.hash).toHaveBeenCalledWith("Password123!", "salt");
        // The plain password is swapped for its hash before the model sees it
        const sentData = paymentModel.createPayment.mock.calls[0][0];
        expect(sentData.AccountRegistration.PasswordHash).toBe("hashedPassword");
        expect(sentData.AccountRegistration.Password).toBeUndefined();

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Payment created and account registered successfully",
                token: "signed.jwt.token",
            })
        );
    });

    it("should return a 400 status when the guest order reference is missing", async () => {
        paymentModel.createPayment.mockRejectedValue(
            new Error("Guest order reference is required for guest checkout")
        );

        const req = { body: {}, user: undefined };
        const res = mockResponse();

        await paymentController.createPayment(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Guest order reference is required for guest checkout",
        });
    });

    it("should return a 403 status when a non customer tries to pay", async () => {
        paymentModel.createPayment.mockRejectedValue(
            new Error("Only customers can create payments")
        );

        const req = { body: {}, user: { id: 7, role: "vendor" } };
        const res = mockResponse();

        await paymentController.createPayment(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return a 404 status when the order cannot be reached", async () => {
        paymentModel.createPayment.mockRejectedValue(
            new Error("Order does not exist or you do not have access to this order")
        );

        const req = { body: {}, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.createPayment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return a 409 status when the order has already been paid", async () => {
        paymentModel.createPayment.mockRejectedValue(
            new Error("Payment has already been made for this order")
        );

        const req = { body: {}, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.createPayment(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "Payment has already been made for this order",
        });
    });

    it("should handle unexpected errors and return a 500 status", async () => {
        paymentModel.createPayment.mockRejectedValue(new Error("Database error"));

        const req = { body: {}, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.createPayment(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error creating payment" });
    });
});

describe("paymentController.updatePaymentStatus", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should update the payment status and return a 200 status", async () => {
        const updated = { PaymentID: 1, PaymentStatus: "Successful" };

        paymentModel.updatePaymentStatus.mockResolvedValue(updated);

        const req = {
            params: { id: "1" },
            body: { PaymentStatus: "Successful" },
            user: { id: 7, role: "vendor" },
        };
        const res = mockResponse();

        await paymentController.updatePaymentStatus(req, res);

        expect(paymentModel.updatePaymentStatus).toHaveBeenCalledWith(
            1,
            "Successful",
            req.user
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(updated);
    });

    it("should return a 404 status when the payment is not found", async () => {
        paymentModel.updatePaymentStatus.mockResolvedValue(null);

        const req = {
            params: { id: "99" },
            body: { PaymentStatus: "Successful" },
            user: { id: 7, role: "vendor" },
        };
        const res = mockResponse();

        await paymentController.updatePaymentStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Payment not found" });
    });

    it("should return a 409 status for a status change the rules do not allow", async () => {
        paymentModel.updatePaymentStatus.mockRejectedValue(
            new Error("Payment status cannot be changed from Refunded to Successful")
        );

        const req = {
            params: { id: "1" },
            body: { PaymentStatus: "Successful" },
            user: { id: 7, role: "vendor" },
        };
        const res = mockResponse();

        await paymentController.updatePaymentStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("should handle unexpected errors and return a 500 status", async () => {
        paymentModel.updatePaymentStatus.mockRejectedValue(new Error("Database error"));

        const req = {
            params: { id: "1" },
            body: { PaymentStatus: "Successful" },
            user: { id: 7, role: "vendor" },
        };
        const res = mockResponse();

        await paymentController.updatePaymentStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to update payment status" });
    });
});

describe("paymentController.updatePaymentMethod", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should change the payment method and return a 200 status", async () => {
        const updated = { PaymentID: 1, PaymentMethod: "Card" };

        paymentModel.updatePaymentMethod.mockResolvedValue(updated);

        const req = {
            params: { id: "1" },
            body: { PaymentMethod: "Card" },
            user: { id: 5, role: "customer" },
        };
        const res = mockResponse();

        await paymentController.updatePaymentMethod(req, res);

        expect(paymentModel.updatePaymentMethod).toHaveBeenCalledWith(1, req.body, req.user);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(updated);
    });

    it("should return a 404 status when the payment is not found or not theirs", async () => {
        paymentModel.updatePaymentMethod.mockResolvedValue(null);

        const req = {
            params: { id: "99" },
            body: { PaymentMethod: "Card" },
            user: { id: 5, role: "customer" },
        };
        const res = mockResponse();

        await paymentController.updatePaymentMethod(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: "Payment not found or access denied",
        });
    });

    it("should return a 409 status once the order is no longer pending", async () => {
        paymentModel.updatePaymentMethod.mockRejectedValue(
            new Error("Payment method can only be changed while the order is pending")
        );

        const req = {
            params: { id: "1" },
            body: { PaymentMethod: "Card" },
            user: { id: 5, role: "customer" },
        };
        const res = mockResponse();

        await paymentController.updatePaymentMethod(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("should handle unexpected errors and return a 500 status", async () => {
        paymentModel.updatePaymentMethod.mockRejectedValue(new Error("Database error"));

        const req = {
            params: { id: "1" },
            body: { PaymentMethod: "Card" },
            user: { id: 5, role: "customer" },
        };
        const res = mockResponse();

        await paymentController.updatePaymentMethod(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to update payment method" });
    });
});

describe("paymentController.deletePayment", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should delete the payment and return a 204 status", async () => {
        paymentModel.deletePayment.mockResolvedValue(true);

        const req = { params: { id: "1" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.deletePayment(req, res);

        expect(paymentModel.deletePayment).toHaveBeenCalledWith(1, req.user);
        expect(res.status).toHaveBeenCalledWith(204);
        expect(res.send).toHaveBeenCalled();
    });

    it("should return a 404 status when the payment is not found", async () => {
        paymentModel.deletePayment.mockResolvedValue(false);

        const req = { params: { id: "99" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.deletePayment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Payment not found" });
    });

    it("should return a 409 status when the payment already succeeded", async () => {
        paymentModel.deletePayment.mockRejectedValue(
            new Error("Successful or refunded payments cannot be deleted")
        );

        const req = { params: { id: "1" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.deletePayment(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "Successful or refunded payments cannot be deleted",
        });
    });

    it("should handle unexpected errors and return a 500 status", async () => {
        paymentModel.deletePayment.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "1" }, user: { id: 5, role: "customer" } };
        const res = mockResponse();

        await paymentController.deletePayment(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to delete payment" });
    });
});
