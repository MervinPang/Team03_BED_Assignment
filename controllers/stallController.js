// Stall Controller - Handles HTTP requests for stalls and menu items
const stallModel = require("../models/stallModel");

// Retrieve all active food stalls
async function getAllStalls(req, res) {
    try {
        const stalls = await stallModel.getAllStalls();

        return res.status(200).json(stalls);
    } catch (error) {
        console.error("Controller error (getAllStalls):", error);

        return res.status(500).json({
            error: "Unable to retrieve food stalls",
        });
    }
}

// Retrieve one food stall by its ID
async function getStallById(req, res) {
    try {
        const stallId = Number(req.params.id);

        if (!Number.isInteger(stallId) || stallId <= 0) {
            return res.status(400).json({
                error: "Invalid stall ID. Stall ID must be a positive integer",
            });
        }

        const stall = await stallModel.getStallById(stallId);

        if (!stall) {
            return res.status(404).json({
                error: "Food stall not found",
            });
        }

        return res.status(200).json(stall);
    } catch (error) {
        console.error("Controller error (getStallById):", error);

        return res.status(500).json({
            error: "Unable to retrieve the food stall",
        });
    }
}

// Retrieve all menu items belonging to one food stall
async function getMenuItemsByStallId(req, res) {
    try {
        const stallId = Number(req.params.id);

        if (!Number.isInteger(stallId) || stallId <= 0) {
            return res.status(400).json({
                error: "Invalid stall ID. Stall ID must be a positive integer",
            });
        }

        const stall = await stallModel.getStallById(stallId);

        if (!stall) {
            return res.status(404).json({
                error: "Food stall not found",
            });
        }

        const menuItems = await stallModel.getMenuItemsByStallId(stallId);

        return res.status(200).json(menuItems);
    } catch (error) {
        console.error("Controller error (getMenuItemsByStallId):", error);

        return res.status(500).json({
            error: "Unable to retrieve menu items",
        });
    }
}

// Retrieve stalls assigned to the authenticated vendor
async function getMyVendorStalls(req, res) {
    try {
        const vendorUserId = Number(req.user.id);

        if (
            !Number.isInteger(vendorUserId) ||
            vendorUserId <= 0
        ) {
            return res.status(401).json({
                error: "Invalid authenticated user",
            });
        }

        const stalls =
            await stallModel.getStallsByVendorId(
                vendorUserId
            );

        return res.status(200).json(stalls);
    } catch (error) {
        console.error(
            "Controller error (getMyVendorStalls):",
            error
        );

        return res.status(500).json({
            error: "Unable to retrieve vendor stalls",
        });
    }
}

module.exports = {
    getAllStalls,
    getStallById,
    getMenuItemsByStallId,
    getMyVendorStalls,
};