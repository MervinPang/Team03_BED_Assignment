// userController.test.js
// Unit tests for the User Registration and Login controller

const userController = require("../controllers/userController");
const userModel = require("../models/userModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Mock the User model so no database is needed
jest.mock("../models/userModel");
jest.mock("bcrypt");
jest.mock("jsonwebtoken");

// Build a fake response object with mocked Express methods
function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

describe("userController.registerUser", () => {
    beforeEach(() => {
        jest.clearAllMocks(); // Clear mock calls before each test
    });

    it("should register a new user and return a 201 status with the new user", async () => {
        const req = {
            body: {
                Username: "raynetan",
                Email: "rayne@example.com",
                Password: "Password123!",
                Role: "customer",
            },
        };
        const res = mockResponse();

        const mockUser = {
            UserID: 1,
            Username: "raynetan",
            Email: "rayne@example.com",
            Role: "customer",
        };

        // Nobody is using the email or the username yet
        userModel.getUserByEmail.mockResolvedValue(null);
        userModel.getUserByUsername.mockResolvedValue(null);
        bcrypt.genSalt.mockResolvedValue("salt");
        bcrypt.hash.mockResolvedValue("hashedPassword");
        userModel.createUser.mockResolvedValue(mockUser);

        await userController.registerUser(req, res);

        expect(userModel.getUserByEmail).toHaveBeenCalledWith("rayne@example.com");
        expect(userModel.getUserByUsername).toHaveBeenCalledWith("raynetan");
        // The plain password must never reach the model
        expect(bcrypt.hash).toHaveBeenCalledWith("Password123!", "salt");
        expect(userModel.createUser).toHaveBeenCalledWith({
            Username: "raynetan",
            Email: "rayne@example.com",
            PasswordHash: "hashedPassword",
            Role: "customer",
        });
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            message: "User registered successfully",
            user: mockUser,
        });
    });

    it("should return a 400 status when the email is already registered", async () => {
        const req = {
            body: {
                Username: "raynetan",
                Email: "rayne@example.com",
                Password: "Password123!",
                Role: "customer",
            },
        };
        const res = mockResponse();

        userModel.getUserByEmail.mockResolvedValue({ UserID: 9 });

        await userController.registerUser(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Email is already registered",
        });
        expect(userModel.createUser).not.toHaveBeenCalled();
    });

    it("should return a 400 status when the username is already taken", async () => {
        const req = {
            body: {
                Username: "raynetan",
                Email: "rayne@example.com",
                Password: "Password123!",
                Role: "customer",
            },
        };
        const res = mockResponse();

        userModel.getUserByEmail.mockResolvedValue(null);
        userModel.getUserByUsername.mockResolvedValue({ UserID: 9 });

        await userController.registerUser(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Username is already taken",
        });
        expect(userModel.createUser).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        const req = {
            body: {
                Username: "raynetan",
                Email: "rayne@example.com",
                Password: "Password123!",
                Role: "customer",
            },
        };
        const res = mockResponse();

        userModel.getUserByEmail.mockRejectedValue(new Error("Database error"));

        await userController.registerUser(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error registering user" });
    });
});

describe("userController.loginUser", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.JWT_SECRET = "test-secret";
    });

    it("should return a 200 status with a token for valid credentials", async () => {
        const req = {
            body: { Email: "rayne@example.com", Password: "Password123!" },
        };
        const res = mockResponse();

        userModel.getUserByEmail.mockResolvedValue({
            UserID: 1,
            Username: "raynetan",
            Email: "rayne@example.com",
            PasswordHash: "hashedPassword",
            Role: "customer",
        });
        bcrypt.compare.mockResolvedValue(true);
        jwt.sign.mockReturnValue("signed.jwt.token");

        await userController.loginUser(req, res);

        expect(bcrypt.compare).toHaveBeenCalledWith("Password123!", "hashedPassword");
        // The token carries the identity the rest of the API trusts
        expect(jwt.sign).toHaveBeenCalledWith(
            {
                id: 1,
                username: "raynetan",
                email: "rayne@example.com",
                role: "customer",
            },
            "test-secret",
            { expiresIn: "3600s" }
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Login successful",
            token: "signed.jwt.token",
        });
    });

    it("should return a 401 status when the email is not registered", async () => {
        const req = {
            body: { Email: "nobody@example.com", Password: "Password123!" },
        };
        const res = mockResponse();

        userModel.getUserByEmail.mockResolvedValue(null);

        await userController.loginUser(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: "Invalid email or password",
        });
        expect(jwt.sign).not.toHaveBeenCalled();
    });

    it("should return a 401 status when the password does not match", async () => {
        const req = {
            body: { Email: "rayne@example.com", Password: "WrongPassword" },
        };
        const res = mockResponse();

        userModel.getUserByEmail.mockResolvedValue({
            UserID: 1,
            Username: "raynetan",
            Email: "rayne@example.com",
            PasswordHash: "hashedPassword",
            Role: "customer",
        });
        bcrypt.compare.mockResolvedValue(false);

        await userController.loginUser(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: "Invalid email or password",
        });
        expect(jwt.sign).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        const req = {
            body: { Email: "rayne@example.com", Password: "Password123!" },
        };
        const res = mockResponse();

        userModel.getUserByEmail.mockRejectedValue(new Error("Database error"));

        await userController.loginUser(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error logging in" });
    });
});
