// Stall Controller - Handles HTTP requests for stalls and menu items
const stallModel = require("../models/stallModel");

// Get all stalls with optional filters
async function getAllStalls(req, res) {
    const name = req.query.name;
    const cuisine = req.query.cuisine;
    const area = req.query.area;
    const grade = req.query.grade;

    if (name && name.trim().length > 150) {
        return res.status(400).json({
            error: "Stall name search cannot exceed 150 characters"
        });
    }

    if (cuisine && cuisine.trim().length > 100) {
        return res.status(400).json({
            error: "Cuisine cannot exceed 100 characters"
        });
    }

    if (area && area.trim().length > 150) {
        return res.status(400).json({
            error: "Location cannot exceed 150 characters"
        });
    }

    // Validate hygiene grade
    if (grade && !["A", "B", "C", "D"].includes(
            grade.toUpperCase()
        )
    ) {
        return res.status(400).json({
            error: "Hygiene grade must be A, B, C, or D"
        });
    }

    const filters = {
        name: name ? name.trim() : null,
        cuisine: cuisine ? cuisine.trim() : null,
        area: area ? area.trim() : null,
        grade: grade ? grade.trim().toUpperCase() : null
    };

    try {
        const stalls = await stallModel.getAllStalls(filters);

        return res.status(200).json(stalls);
    } catch (error) {
        console.error("Error retrieving stalls:", error);

        return res.status(500).json({
            error: "Unable to retrieve food stalls"
        });
    }
}

// Get available stall filter options
async function getStallFilterOptions(req, res) {
    try {
        const options = await stallModel.getStallFilterOptions();

        return res.status(200).json(options);
    } catch (error) {
        console.error("Error retrieving stall filters:", error);

        return res.status(500).json({
            error: "Unable to retrieve stall filter options"
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
            !Number.isInteger(vendorUserId) || vendorUserId <= 0
        ) {
            return res.status(401).json({ error: "Invalid authenticated user", });
        }

        const stalls = await stallModel.getStallsByVendorId(vendorUserId);

        return res.status(200).json(stalls);
    } catch (error) {
        console.error("Controller error (getMyVendorStalls):", error);

        return res.status(500).json({
            error: "Unable to retrieve vendor stalls",
        });
    }
}

module.exports = {
    getAllStalls,
    getStallFilterOptions,
    getStallById,
    getMenuItemsByStallId,
    getMyVendorStalls,
};