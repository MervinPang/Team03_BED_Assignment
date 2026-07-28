// Discovery Controller - Handles HTTP requests for searching hawker centres by
// area and filtering food stalls by price range and NEA hygiene grade
const discoveryModel = require("../models/discoveryModel");

// Retrieve every area that customers can browse
async function getAreas(req, res) {
    try {
        const areas = await discoveryModel.getAreas();

        return res.status(200).json(areas);
    } catch (error) {
        console.error("Controller error (getAreas):", error);

        return res.status(500).json({
            error: "Unable to retrieve areas",
        });
    }
}

// Retrieve hawker centres, optionally limited to one area
async function getHawkerCentres(req, res) {
    try {
        const centres = await discoveryModel.getHawkerCentres(req.searchArea);

        return res.status(200).json(centres);
    } catch (error) {
        console.error("Controller error (getHawkerCentres):", error);

        return res.status(500).json({
            error: "Unable to retrieve hawker centres",
        });
    }
}

// Retrieve the stalls of one hawker centre with their grades and prices
async function getStallsByHawkerCentre(req, res) {
    try {
        const hawkerCentreId = Number(req.params.id);

        const hawkerCentre = await discoveryModel.getHawkerCentreById(
            hawkerCentreId
        );

        if (!hawkerCentre) {
            return res.status(404).json({
                error: "Hawker centre not found",
            });
        }

        const stalls = await discoveryModel.searchStalls({ hawkerCentreId });

        return res.status(200).json({
            hawkerCentre,
            stallCount: stalls.length,
            stalls,
        });
    } catch (error) {
        console.error("Controller error (getStallsByHawkerCentre):", error);

        return res.status(500).json({
            error: "Unable to retrieve stalls for this hawker centre",
        });
    }
}

// Search stalls by any combination of area, hygiene grade and price range
async function searchStalls(req, res) {
    try {
        const stalls = await discoveryModel.searchStalls(req.searchFilters);

        return res.status(200).json({
            filters: req.searchFilters,
            stallCount: stalls.length,
            stalls,
        });
    } catch (error) {
        console.error("Controller error (searchStalls):", error);

        return res.status(500).json({
            error: "Unable to search food stalls",
        });
    }
}

module.exports = {
    getAreas,
    getHawkerCentres,
    getStallsByHawkerCentre,
    searchStalls,
};