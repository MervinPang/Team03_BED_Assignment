// userModel.test.js
// Unit tests for the User Registration and Login model

const User = require("../models/userModel");
const sql = require("mssql");

jest.mock("mssql"); // Mock the mssql library

// Build the connection, request and result chain the model expects
function mockConnection(queryResult) {
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
        query: jest.fn().mockResolvedValue(queryResult),
    };

    const connection = {
        request: jest.fn().mockReturnValue(mockRequest),
        close: jest.fn().mockResolvedValue(undefined),
    };

    sql.connect.mockResolvedValue(connection); // Return the mock connection

    return { connection, mockRequest };
}

describe("userModel.getUserByEmail", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the user that owns the email address", async () => {
        const mockUser = {
            UserID: 1,
            Username: "raynetan",
            Email: "rayne@example.com",
            PasswordHash: "hashedPassword",
            Role: "customer",
        };

        const { connection, mockRequest } = mockConnection({ recordset: [mockUser] });

        const user = await User.getUserByEmail("rayne@example.com");

        expect(sql.connect).toHaveBeenCalledWith(expect.any(Object));
        expect(mockRequest.input).toHaveBeenCalledWith(
            "Email",
            expect.anything(),
            "rayne@example.com"
        );
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(user).toEqual(mockUser);
    });

    it("should return null when no account uses that email", async () => {
        const { connection } = mockConnection({ recordset: [] });

        const user = await User.getUserByEmail("nobody@example.com");

        expect(user).toBeNull();
        expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it("should handle errors when retrieving the user", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(User.getUserByEmail("rayne@example.com")).rejects.toThrow(errorMessage);
    });
});

describe("userModel.getUserByUsername", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the user that owns the username", async () => {
        const mockUser = {
            UserID: 1,
            Username: "raynetan",
            Email: "rayne@example.com",
            Role: "customer",
        };

        const { connection, mockRequest } = mockConnection({ recordset: [mockUser] });

        const user = await User.getUserByUsername("raynetan");

        expect(mockRequest.input).toHaveBeenCalledWith(
            "Username",
            expect.anything(),
            "raynetan"
        );
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(user).toEqual(mockUser);
    });

    it("should return null when the username is free", async () => {
        mockConnection({ recordset: [] });

        const user = await User.getUserByUsername("brandnew");

        expect(user).toBeNull();
    });

    it("should handle errors when retrieving the user", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(User.getUserByUsername("raynetan")).rejects.toThrow(errorMessage);
    });
});

describe("userModel.createUser", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should insert the account and return it without the password hash", async () => {
        const { connection, mockRequest } = mockConnection({
            recordset: [{ UserID: 12 }],
        });

        const newUser = await User.createUser({
            Username: "raynetan",
            Email: "rayne@example.com",
            PasswordHash: "hashedPassword",
            Role: "customer",
        });

        expect(mockRequest.input).toHaveBeenCalledWith(
            "PasswordHash",
            expect.anything(),
            "hashedPassword"
        );
        expect(connection.close).toHaveBeenCalledTimes(1);

        // The hash is never handed back to the caller
        expect(newUser).toEqual({
            UserID: 12,
            Username: "raynetan",
            Email: "rayne@example.com",
            Role: "customer",
        });
        expect(newUser.PasswordHash).toBeUndefined();
    });

    it("should handle errors when creating the user", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            User.createUser({
                Username: "raynetan",
                Email: "rayne@example.com",
                PasswordHash: "hashedPassword",
                Role: "customer",
            })
        ).rejects.toThrow(errorMessage);
    });
});
