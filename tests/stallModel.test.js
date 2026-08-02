// stallModel.test.js
// Unit tests for the Food Stall and Menu Item model

const Stall = require("../models/stallModel");
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

describe("stallModel.getAllStalls", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve all stalls from the database", async () => {
        const mockStalls = [
            { StallID: 1, StallName: "Ah Hock Chicken Rice", HygieneGrade: "A" },
            { StallID: 2, StallName: "Tian Tian Laksa", HygieneGrade: "B" },
        ];

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockStalls });

        const stalls = await Stall.getAllStalls();

        expect(sql.connect).toHaveBeenCalledWith(expect.any(Object));
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(stalls).toHaveLength(2);
        expect(stalls[0].StallName).toBe("Ah Hock Chicken Rice");
    });

    it("should pass every filter to the query as a bound parameter", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        await Stall.getAllStalls({
            name: "laksa",
            cuisine: "Malay",
            area: "Bedok",
            grade: "A",
        });

        // Filters are bound rather than pasted into the SQL text
        expect(mockRequest.input).toHaveBeenCalledWith("Name", expect.anything(), "laksa");
        expect(mockRequest.input).toHaveBeenCalledWith("Cuisine", expect.anything(), "Malay");
        expect(mockRequest.input).toHaveBeenCalledWith("Area", expect.anything(), "Bedok");
        expect(mockRequest.input).toHaveBeenCalledWith("Grade", expect.anything(), "A");
    });

    it("should send null for a filter that was not given", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        await Stall.getAllStalls();

        expect(mockRequest.input).toHaveBeenCalledWith("Name", expect.anything(), null);
    });

    it("should handle errors when retrieving stalls", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Stall.getAllStalls()).rejects.toThrow(errorMessage);
    });
});

describe("stallModel.getStallFilterOptions", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the areas, cuisines and the fixed hygiene grades", async () => {
        const { connection, mockRequest } = mockConnection();

        mockRequest.query
            .mockResolvedValueOnce({ recordset: [{ Area: "Bedok" }, { Area: "Tampines" }] })
            .mockResolvedValueOnce({
                recordset: [{ CuisineName: "Chinese" }, { CuisineName: "Malay" }],
            });

        const options = await Stall.getStallFilterOptions();

        expect(options).toEqual({
            areas: ["Bedok", "Tampines"],
            cuisines: ["Chinese", "Malay"],
            hygieneGrades: ["A", "B", "C", "D"],
        });
        expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it("should handle errors when retrieving the filter options", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Stall.getStallFilterOptions()).rejects.toThrow(errorMessage);
    });
});

describe("stallModel.getStallById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve one stall by its ID", async () => {
        const mockStall = { StallID: 1, StallName: "Ah Hock Chicken Rice" };

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [mockStall] });

        const stall = await Stall.getStallById(1);

        expect(mockRequest.input).toHaveBeenCalledWith("StallID", expect.anything(), 1);
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(stall).toEqual(mockStall);
    });

    it("should return null when the stall does not exist or is closed", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const stall = await Stall.getStallById(999);

        expect(stall).toBeNull();
    });

    it("should handle errors when retrieving the stall", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Stall.getStallById(1)).rejects.toThrow(errorMessage);
    });
});

describe("stallModel.getMenuItemsByStallId", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the menu items of one stall", async () => {
        const mockItems = [
            { MenuItemID: 1, ItemName: "Chicken Rice", Price: 4.5 },
            { MenuItemID: 2, ItemName: "Roast Pork", Price: 5 },
        ];

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockItems });

        const items = await Stall.getMenuItemsByStallId(1);

        expect(mockRequest.input).toHaveBeenCalledWith("StallID", expect.anything(), 1);
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(items).toHaveLength(2);
    });

    it("should handle errors when retrieving the menu items", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Stall.getMenuItemsByStallId(1)).rejects.toThrow(errorMessage);
    });
});

describe("stallModel.getStallsByVendorId", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the stalls assigned to one vendor", async () => {
        const mockStalls = [{ StallID: 3, StallName: "Rayne's Rojak", VendorUserID: 7 }];

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockStalls });

        const stalls = await Stall.getStallsByVendorId(7);

        expect(mockRequest.input).toHaveBeenCalledWith(
            "VendorUserID",
            expect.anything(),
            7
        );
        expect(connection.close).toHaveBeenCalledTimes(1);
        expect(stalls).toEqual(mockStalls);
    });

    it("should return an empty list for a vendor who holds no stall", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const stalls = await Stall.getStallsByVendorId(10);

        expect(stalls).toEqual([]);
    });

    it("should handle errors when retrieving the vendor's stalls", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Stall.getStallsByVendorId(7)).rejects.toThrow(errorMessage);
    });
});
