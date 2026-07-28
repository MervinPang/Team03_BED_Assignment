// Vendor Menu Controller - Handles HTTP requests for managing a vendor's own
// food stall and its menu items
const vendorMenuModel = require("../models/vendorMenuModel");

// Retrieve every menu item of the vendor's stall, including sold out items
async function getMenuItems(req, res) {
    try {
        const menuItems = await vendorMenuModel.getMenuItemsForVendor(
            Number(req.params.stallId)
        );

        return res.status(200).json({
            stall: req.stall.StallName,
            itemCount: menuItems.length,
            menuItems,
        });
    } catch (error) {
        console.error("Controller error (getMenuItems):", error);

        return res.status(500).json({
            error: "Unable to retrieve menu items",
        });
    }
}

// Add a menu item to the vendor's stall
async function createMenuItem(req, res) {
    try {
        const menuItem = await vendorMenuModel.createMenuItem(
            Number(req.params.stallId),
            req.body
        );

        return res.status(201).json({
            message: "Menu item created successfully",
            menuItem,
        });
    } catch (error) {
        console.error("Controller error (createMenuItem):", error);

        return res.status(500).json({
            error: "Unable to create the menu item",
        });
    }
}

// Update the details of a menu item
async function updateMenuItem(req, res) {
    try {
        const menuItem = await vendorMenuModel.updateMenuItem(
            Number(req.params.itemId),
            req.body
        );

        if (!menuItem) {
            return res.status(404).json({ error: "Menu item not found" });
        }

        return res.status(200).json({
            message: "Menu item updated successfully",
            menuItem,
        });
    } catch (error) {
        console.error("Controller error (updateMenuItem):", error);

        return res.status(500).json({
            error: "Unable to update the menu item",
        });
    }
}

// Mark a menu item as available or sold out
async function updateMenuItemAvailability(req, res) {
    try {
        const menuItem = await vendorMenuModel.updateMenuItemAvailability(
            Number(req.params.itemId),
            req.body.IsAvailable
        );

        if (!menuItem) {
            return res.status(404).json({ error: "Menu item not found" });
        }

        return res.status(200).json({
            message: req.body.IsAvailable
                ? "Menu item is available again"
                : "Menu item marked as sold out",
            menuItem,
        });
    } catch (error) {
        console.error("Controller error (updateMenuItemAvailability):", error);

        return res.status(500).json({
            error: "Unable to update the availability of the menu item",
        });
    }
}

/*
 * Delete a menu item. An item that already appears in an order is kept so past
 * orders continue to show what the customer actually bought. The vendor is told
 * to mark it as sold out instead.
 */
async function deleteMenuItem(req, res) {
    try {
        const menuItemId = Number(req.params.itemId);

        const orderItemCount = await vendorMenuModel.countOrderItems(menuItemId);

        if (orderItemCount > 0) {
            return res.status(409).json({
                error:
                    "This menu item belongs to an existing order and cannot be deleted. Mark it as sold out instead",
            });
        }

        const deleted = await vendorMenuModel.deleteMenuItem(menuItemId);

        if (!deleted) {
            return res.status(404).json({ error: "Menu item not found" });
        }

        return res.status(204).send();
    } catch (error) {
        console.error("Controller error (deleteMenuItem):", error);

        return res.status(500).json({
            error: "Unable to delete the menu item",
        });
    }
}

// Update the stall details, including closing the stall temporarily
async function updateStall(req, res) {
    try {
        const stall = await vendorMenuModel.updateStall(
            Number(req.params.stallId),
            req.body
        );

        if (!stall) {
            return res.status(404).json({ error: "Food stall not found" });
        }

        return res.status(200).json({
            message: stall.IsActive
                ? "Stall updated successfully"
                : "Stall updated and is now closed to customers",
            stall,
        });
    } catch (error) {
        console.error("Controller error (updateStall):", error);

        return res.status(500).json({
            error: "Unable to update the food stall",
        });
    }
}

module.exports = {
    getMenuItems,
    createMenuItem,
    updateMenuItem,
    updateMenuItemAvailability,
    deleteMenuItem,
    updateStall,
};
