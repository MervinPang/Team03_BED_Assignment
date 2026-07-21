// Stall Model - Handles database operations for food stalls and their menu items
const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Retrieve all active food stalls
async function getAllStalls() {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const result = await connection.request().query(`
            SELECT
                fs.StallID,
                fs.StallName,
                fs.StallDesc AS Description,
                fs.StallImage,
                fs.IsActive AS IsAvailable,
                fs.StallUnitNo,
                hc.HCName,
                hc.HCAddress,
                cuisineData.Cuisine
            FROM FoodStall fs
            JOIN HawkerCentre hc
                ON fs.HawkerCentreID = hc.HawkerCentreID
            OUTER APPLY (
                SELECT STRING_AGG(CuisineName, ', ') AS Cuisine
                FROM (
                    SELECT DISTINCT c.CuisineName
                    FROM MenuItem mi
                    JOIN MenuItemCuisine mic
                        ON mi.MenuItemID = mic.MenuItemID
                    JOIN Cuisine c
                        ON mic.CuisineID = c.CuisineID
                    WHERE mi.StallID = fs.StallID
                ) distinctCuisines
            ) cuisineData
            WHERE fs.IsActive = 1
            ORDER BY fs.StallName;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getAllStalls):", error);
        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Retrieve one active food stall by its ID
async function getStallById(stallId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("StallID", sql.Int, stallId);

        const result = await request.query(`
            SELECT
                fs.StallID,
                fs.StallName,
                fs.StallDesc AS Description,
                fs.StallImage,
                fs.IsActive AS IsAvailable,
                fs.StallUnitNo,
                fs.VendorUserID,
                fs.HawkerCentreID,
                hc.HCName,
                hc.HCAddress,
                STRING_AGG(c.CuisineName, ', ') AS Cuisine
            FROM FoodStall fs
            JOIN HawkerCentre hc
                ON fs.HawkerCentreID = hc.HawkerCentreID
            LEFT JOIN MenuItem mi
                ON fs.StallID = mi.StallID
            LEFT JOIN MenuItemCuisine mic
                ON mi.MenuItemID = mic.MenuItemID
            LEFT JOIN Cuisine c
                ON mic.CuisineID = c.CuisineID
            WHERE fs.StallID = @StallID
              AND fs.IsActive = 1
            GROUP BY
                fs.StallID,
                fs.StallName,
                fs.StallDesc,
                fs.StallImage,
                fs.IsActive,
                fs.StallUnitNo,
                fs.VendorUserID,
                fs.HawkerCentreID,
                hc.HCName,
                hc.HCAddress;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getStallById):", error);
        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Retrieve all menu items belonging to one active food stall
async function getMenuItemsByStallId(stallId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("StallID", sql.Int, stallId);

        const result = await request.query(`
            SELECT
                mi.MenuItemID,
                mi.StallID,
                mi.ItemName,
                mi.ItemDesc,
                mi.ItemPrice AS Price,
                mi.ItemCategory,
                mi.ItemImage,
                mi.IsAvailable,
                STRING_AGG(c.CuisineName, ', ') AS Cuisine
            FROM MenuItem mi
            JOIN FoodStall fs
                ON mi.StallID = fs.StallID
            LEFT JOIN MenuItemCuisine mic
                ON mi.MenuItemID = mic.MenuItemID
            LEFT JOIN Cuisine c
                ON mic.CuisineID = c.CuisineID
            WHERE mi.StallID = @StallID
              AND fs.IsActive = 1
            GROUP BY
                mi.MenuItemID,
                mi.StallID,
                mi.ItemName,
                mi.ItemDesc,
                mi.ItemPrice,
                mi.ItemCategory,
                mi.ItemImage,
                mi.IsAvailable
            ORDER BY mi.ItemCategory, mi.ItemName;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getMenuItemsByStallId):", error);
        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Retrieve food stalls assigned to the authenticated vendor
async function getStallsByVendorId(vendorUserId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();

        request.input(
            "VendorUserID",
            sql.Int,
            vendorUserId
        );

        const result = await request.query(`
            SELECT
                fs.StallID,
                fs.StallName,
                fs.StallDesc AS Description,
                fs.StallImage,
                fs.IsActive AS IsAvailable,
                fs.StallUnitNo,
                fs.VendorUserID,
                fs.HawkerCentreID,
                hc.HCName,
                hc.HCAddress,
                cuisineData.Cuisine
            FROM FoodStall fs
            JOIN HawkerCentre hc
                ON fs.HawkerCentreID = hc.HawkerCentreID
            OUTER APPLY (
                SELECT
                    STRING_AGG(
                        distinctCuisines.CuisineName,
                        ', '
                    ) AS Cuisine
                FROM (
                    SELECT DISTINCT
                        c.CuisineName
                    FROM MenuItem mi
                    JOIN MenuItemCuisine mic
                        ON mi.MenuItemID =
                            mic.MenuItemID
                    JOIN Cuisine c
                        ON mic.CuisineID =
                            c.CuisineID
                    WHERE mi.StallID = fs.StallID
                ) distinctCuisines
            ) cuisineData
            WHERE fs.VendorUserID = @VendorUserID
            ORDER BY fs.StallName;
        `);

        return result.recordset;
    } catch (error) {
        console.error(
            "Database error (getStallsByVendorId):",
            error
        );

        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

module.exports = {
    getAllStalls,
    getStallById,
    getMenuItemsByStallId,
    getStallsByVendorId,
};