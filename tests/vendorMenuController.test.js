// vendorMenuController.test.js
// Unit tests for the controller a vendor uses to manage their own stall and menu

const vendorMenuController = require("../controllers/vendorMenuController");
const vendorMenuModel = require("../models/vendorMenuModel");

// Mock the Vendor Menu model
jest.mock("../models/vendorMenuModel");

function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

describe("vendorMenuController.getMenuItems", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return every menu item of the vendor's stall", async () => {
        const mockItems = [
            { MenuItemID: 1, ItemName: "Chicken Rice", IsAvailable: true },
            { MenuItemID: 2, ItemName: "Roast Pork", IsAvailable: false },
        ];

        vendorMenuModel.getMenuItemsForVendor.mockResolvedValue(mockItems);

        // requireStallOwnership has already put the stall on the request
        const req = { params: { stallId: "3" }, stall: { StallName: "Rayne's Rojak" } };
        const res = mockResponse();

        await vendorMenuController.getMenuItems(req, res);

        expect(vendorMenuModel.getMenuItemsForVendor).toHaveBeenCalledWith(3);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            stall: "Rayne's Rojak",
            itemCount: 2,
            menuItems: mockItems,
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        vendorMenuModel.getMenuItemsForVendor.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3" }, stall: { StallName: "Rayne's Rojak" } };
        const res = mockResponse();

        await vendorMenuController.getMenuItems(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Unable to retrieve menu items" });
    });
});

describe("vendorMenuController.createMenuItem", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should create a menu item and return a 201 status", async () => {
        const body = { ItemName: "Laksa", ItemPrice: 5.5, ItemCategory: "Main" };
        const mockItem = { MenuItemID: 12, StallID: 3, ...body };

        vendorMenuModel.createMenuItem.mockResolvedValue(mockItem);

        const req = { params: { stallId: "3" }, body };
        const res = mockResponse();

        await vendorMenuController.createMenuItem(req, res);

        expect(vendorMenuModel.createMenuItem).toHaveBeenCalledWith(3, body);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            message: "Menu item created successfully",
            menuItem: mockItem,
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        vendorMenuModel.createMenuItem.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3" }, body: {} };
        const res = mockResponse();

        await vendorMenuController.createMenuItem(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Unable to create the menu item" });
    });
});

describe("vendorMenuController.updateMenuItem", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should update a menu item and return a 200 status", async () => {
        const body = { ItemName: "Laksa", ItemPrice: 6, ItemCategory: "Main" };
        const mockItem = { MenuItemID: 12, StallID: 3, ...body };

        vendorMenuModel.updateMenuItem.mockResolvedValue(mockItem);

        const req = { params: { stallId: "3", itemId: "12" }, body };
        const res = mockResponse();

        await vendorMenuController.updateMenuItem(req, res);

        expect(vendorMenuModel.updateMenuItem).toHaveBeenCalledWith(12, body);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Menu item updated successfully",
            menuItem: mockItem,
        });
    });

    it("should return a 404 status when the menu item does not exist", async () => {
        vendorMenuModel.updateMenuItem.mockResolvedValue(null);

        const req = { params: { stallId: "3", itemId: "999" }, body: {} };
        const res = mockResponse();

        await vendorMenuController.updateMenuItem(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Menu item not found" });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        vendorMenuModel.updateMenuItem.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3", itemId: "12" }, body: {} };
        const res = mockResponse();

        await vendorMenuController.updateMenuItem(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to update the menu item",
        });
    });
});

describe("vendorMenuController.updateMenuItemAvailability", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should mark an item as sold out", async () => {
        const mockItem = { MenuItemID: 12, IsAvailable: false };

        vendorMenuModel.updateMenuItemAvailability.mockResolvedValue(mockItem);

        const req = {
            params: { stallId: "3", itemId: "12" },
            body: { IsAvailable: false },
        };
        const res = mockResponse();

        await vendorMenuController.updateMenuItemAvailability(req, res);

        expect(vendorMenuModel.updateMenuItemAvailability).toHaveBeenCalledWith(12, false);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Menu item marked as sold out",
            menuItem: mockItem,
        });
    });

    it("should bring a sold out item back", async () => {
        const mockItem = { MenuItemID: 12, IsAvailable: true };

        vendorMenuModel.updateMenuItemAvailability.mockResolvedValue(mockItem);

        const req = {
            params: { stallId: "3", itemId: "12" },
            body: { IsAvailable: true },
        };
        const res = mockResponse();

        await vendorMenuController.updateMenuItemAvailability(req, res);

        expect(res.json).toHaveBeenCalledWith({
            message: "Menu item is available again",
            menuItem: mockItem,
        });
    });

    it("should return a 404 status when the menu item does not exist", async () => {
        vendorMenuModel.updateMenuItemAvailability.mockResolvedValue(null);

        const req = {
            params: { stallId: "3", itemId: "999" },
            body: { IsAvailable: true },
        };
        const res = mockResponse();

        await vendorMenuController.updateMenuItemAvailability(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Menu item not found" });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        vendorMenuModel.updateMenuItemAvailability.mockRejectedValue(
            new Error("Database error")
        );

        const req = {
            params: { stallId: "3", itemId: "12" },
            body: { IsAvailable: true },
        };
        const res = mockResponse();

        await vendorMenuController.updateMenuItemAvailability(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to update the availability of the menu item",
        });
    });
});

describe("vendorMenuController.deleteMenuItem", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should delete an item that has never been ordered and return a 204 status", async () => {
        vendorMenuModel.countOrderItems.mockResolvedValue(0);
        vendorMenuModel.deleteMenuItem.mockResolvedValue(true);

        const req = { params: { stallId: "3", itemId: "12" } };
        const res = mockResponse();

        await vendorMenuController.deleteMenuItem(req, res);

        expect(vendorMenuModel.deleteMenuItem).toHaveBeenCalledWith(12);
        expect(res.status).toHaveBeenCalledWith(204);
        expect(res.send).toHaveBeenCalled();
    });

    it("should return a 409 status for an item that appears in an existing order", async () => {
        // Past orders must keep showing what the customer actually bought
        vendorMenuModel.countOrderItems.mockResolvedValue(2);

        const req = { params: { stallId: "3", itemId: "12" } };
        const res = mockResponse();

        await vendorMenuController.deleteMenuItem(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error:
                "This menu item belongs to an existing order and cannot be deleted. Mark it as sold out instead",
        });
        expect(vendorMenuModel.deleteMenuItem).not.toHaveBeenCalled();
    });

    it("should return a 404 status when the menu item does not exist", async () => {
        vendorMenuModel.countOrderItems.mockResolvedValue(0);
        vendorMenuModel.deleteMenuItem.mockResolvedValue(false);

        const req = { params: { stallId: "3", itemId: "999" } };
        const res = mockResponse();

        await vendorMenuController.deleteMenuItem(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Menu item not found" });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        vendorMenuModel.countOrderItems.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3", itemId: "12" } };
        const res = mockResponse();

        await vendorMenuController.deleteMenuItem(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to delete the menu item",
        });
    });
});

describe("vendorMenuController.updateStall", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should update the stall details and return a 200 status", async () => {
        const mockStall = { StallID: 3, StallName: "Rayne's Rojak", IsActive: true };

        vendorMenuModel.updateStall.mockResolvedValue(mockStall);

        const req = {
            params: { stallId: "3" },
            body: { StallName: "Rayne's Rojak", IsActive: true },
        };
        const res = mockResponse();

        await vendorMenuController.updateStall(req, res);

        expect(vendorMenuModel.updateStall).toHaveBeenCalledWith(3, req.body);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Stall updated successfully",
            stall: mockStall,
        });
    });

    it("should say the stall is now closed when it was made inactive", async () => {
        const mockStall = { StallID: 3, StallName: "Rayne's Rojak", IsActive: false };

        vendorMenuModel.updateStall.mockResolvedValue(mockStall);

        const req = {
            params: { stallId: "3" },
            body: { StallName: "Rayne's Rojak", IsActive: false },
        };
        const res = mockResponse();

        await vendorMenuController.updateStall(req, res);

        expect(res.json).toHaveBeenCalledWith({
            message: "Stall updated and is now closed to customers",
            stall: mockStall,
        });
    });

    it("should return a 404 status when the stall does not exist", async () => {
        vendorMenuModel.updateStall.mockResolvedValue(null);

        const req = { params: { stallId: "999" }, body: {} };
        const res = mockResponse();

        await vendorMenuController.updateStall(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Food stall not found" });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        vendorMenuModel.updateStall.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3" }, body: {} };
        const res = mockResponse();

        await vendorMenuController.updateStall(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to update the food stall",
        });
    });
});
