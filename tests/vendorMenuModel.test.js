// vendorMenuModel.test.js
// Unit tests for the model behind a vendor's own stall and menu management

const VendorMenu = require("../models/vendorMenuModel");
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

// deleteMenuItem wraps two statements in a transaction, so the transaction and
// the requests created from it need mocking as well
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

describe("vendorMenuModel.getStallOwner", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the vendor a stall belongs to", async () => {
        const mockStall = { StallID: 3, StallName: "Rayne's Rojak", VendorUserID: 7 };

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [mockStall] });

        const stall = await VendorMenu.getStallOwner(3);

        expect(mockRequest.input).toHaveBeenCalledWith("StallID", expect.anything(), 3);
        // The pool is shared by the whole application and is left open here
        expect(connection.close).not.toHaveBeenCalled();
        expect(stall).toEqual(mockStall);
    });

    it("should return null when the stall does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const stall = await VendorMenu.getStallOwner(999);

        expect(stall).toBeNull();
    });

    it("should handle errors when reading the stall owner", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(VendorMenu.getStallOwner(3)).rejects.toThrow(errorMessage);
    });
});

describe("vendorMenuModel.getMenuItemById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve one menu item with the stall it belongs to", async () => {
        const mockItem = { MenuItemID: 12, StallID: 3, ItemName: "Laksa" };

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [mockItem] });

        const item = await VendorMenu.getMenuItemById(12);

        expect(item).toEqual(mockItem);
    });

    it("should return null when the menu item does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const item = await VendorMenu.getMenuItemById(999);

        expect(item).toBeNull();
    });

    it("should handle errors when reading the menu item", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(VendorMenu.getMenuItemById(12)).rejects.toThrow(errorMessage);
    });
});

describe("vendorMenuModel.getMenuItemsForVendor", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve every item of the stall, including the sold out ones", async () => {
        const mockItems = [
            { MenuItemID: 1, ItemName: "Chicken Rice", IsAvailable: true },
            { MenuItemID: 2, ItemName: "Roast Pork", IsAvailable: false },
        ];

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockItems });

        const items = await VendorMenu.getMenuItemsForVendor(3);

        expect(mockRequest.input).toHaveBeenCalledWith("StallID", expect.anything(), 3);
        expect(items).toHaveLength(2);
    });

    it("should handle errors when retrieving the menu", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(VendorMenu.getMenuItemsForVendor(3)).rejects.toThrow(errorMessage);
    });
});

describe("vendorMenuModel.createMenuItem", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should insert the item and return the row that was written", async () => {
        const inserted = { MenuItemID: 12, StallID: 3, ItemName: "Laksa", Price: 5.5 };

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [inserted] });

        const item = await VendorMenu.createMenuItem(3, {
            ItemName: "Laksa",
            ItemPrice: 5.5,
            ItemCategory: "Main",
        });

        expect(mockRequest.input).toHaveBeenCalledWith("StallID", expect.anything(), 3);
        expect(mockRequest.input).toHaveBeenCalledWith(
            "ItemName",
            expect.anything(),
            "Laksa"
        );
        // An item is on sale unless the vendor says otherwise
        expect(mockRequest.input).toHaveBeenCalledWith("IsAvailable", expect.anything(), 1);
        expect(item).toEqual(inserted);
    });

    it("should handle errors when creating the menu item", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            VendorMenu.createMenuItem(3, { ItemName: "Laksa", ItemPrice: 5.5 })
        ).rejects.toThrow(errorMessage);
    });
});

describe("vendorMenuModel.updateMenuItem", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should update the item and return the new row", async () => {
        const updated = { MenuItemID: 12, ItemName: "Laksa", Price: 6 };

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [updated] });

        const item = await VendorMenu.updateMenuItem(12, {
            ItemName: "Laksa",
            ItemPrice: 6,
            ItemCategory: "Main",
            IsAvailable: 1,
        });

        expect(item).toEqual(updated);
    });

    it("should return null when the item does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const item = await VendorMenu.updateMenuItem(999, { ItemName: "Laksa" });

        expect(item).toBeNull();
    });

    it("should handle errors when updating the menu item", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(VendorMenu.updateMenuItem(12, {})).rejects.toThrow(errorMessage);
    });
});

describe("vendorMenuModel.updateMenuItemAvailability", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should mark an item as sold out", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({
            recordset: [{ MenuItemID: 12, IsAvailable: false }],
        });

        const item = await VendorMenu.updateMenuItemAvailability(12, false);

        expect(mockRequest.input).toHaveBeenCalledWith("IsAvailable", expect.anything(), 0);
        expect(item.IsAvailable).toBe(false);
    });

    it("should bring a sold out item back", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({
            recordset: [{ MenuItemID: 12, IsAvailable: true }],
        });

        await VendorMenu.updateMenuItemAvailability(12, true);

        expect(mockRequest.input).toHaveBeenCalledWith("IsAvailable", expect.anything(), 1);
    });

    it("should return null when the item does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const item = await VendorMenu.updateMenuItemAvailability(999, true);

        expect(item).toBeNull();
    });

    it("should handle errors when changing the availability", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(VendorMenu.updateMenuItemAvailability(12, true)).rejects.toThrow(
            errorMessage
        );
    });
});

describe("vendorMenuModel.countOrderItems", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should count how many times the item appears in past orders", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [{ OrderItemCount: 3 }] });

        const count = await VendorMenu.countOrderItems(12);

        expect(count).toBe(3);
    });

    it("should handle errors when counting the order items", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(VendorMenu.countOrderItems(12)).rejects.toThrow(errorMessage);
    });
});

describe("vendorMenuModel.deleteMenuItem", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should remove the cuisine links and the item in one transaction", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({ rowsAffected: [1] }) // MenuItemCuisine
            .mockResolvedValueOnce({ rowsAffected: [1] }); // MenuItem

        const deleted = await VendorMenu.deleteMenuItem(12);

        expect(transaction.begin).toHaveBeenCalledTimes(1);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(transaction.rollback).not.toHaveBeenCalled();
        expect(deleted).toBe(true);
    });

    it("should report false when no row was deleted", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({ rowsAffected: [0] })
            .mockResolvedValueOnce({ rowsAffected: [0] });

        const deleted = await VendorMenu.deleteMenuItem(999);

        expect(deleted).toBe(false);
    });

    it("should roll the transaction back when the delete fails", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockRejectedValue(new Error("Database Error"));

        await expect(VendorMenu.deleteMenuItem(12)).rejects.toThrow("Database Error");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});

describe("vendorMenuModel.updateStall", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should update the stall details and return the new row", async () => {
        const updated = { StallID: 3, StallName: "Rayne's Rojak", IsActive: true };

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [updated] });

        const stall = await VendorMenu.updateStall(3, {
            StallName: "Rayne's Rojak",
            IsActive: true,
        });

        expect(mockRequest.input).toHaveBeenCalledWith("IsActive", expect.anything(), 1);
        expect(stall).toEqual(updated);
    });

    it("should close the stall to customers when IsActive is false", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({
            recordset: [{ StallID: 3, IsActive: false }],
        });

        await VendorMenu.updateStall(3, { StallName: "Rayne's Rojak", IsActive: false });

        expect(mockRequest.input).toHaveBeenCalledWith("IsActive", expect.anything(), 0);
    });

    it("should return null when the stall does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const stall = await VendorMenu.updateStall(999, { StallName: "Gone" });

        expect(stall).toBeNull();
    });

    it("should handle errors when updating the stall", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(VendorMenu.updateStall(3, {})).rejects.toThrow(errorMessage);
    });
});
