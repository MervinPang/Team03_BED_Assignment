// Stall Model - Handles database operations for food stalls and their menu items
const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Retrieve all active food stalls with optional changes
async function getAllStalls(filters = {}) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();

        request.input("Name", sql.VarChar(80), filters.name || null);
        request.input("Cuisine", sql.VarChar(50), filters.cuisine || null);
        request.input("Area", sql.VarChar(50), filters.area || null);
        request.input("Grade", sql.Char(1), filters.grade || null);

        const result = await request.query(`
            SELECT
                fs.StallID,
                fs.StallName,
                fs.StallDesc AS Description,
                fs.StallImage,
                fs.IsActive AS IsAvailable,
                fs.StallUnitNo,
                hc.HCName,
                hc.HCAddress,
                hc.Area,
                (
                    SELECT TOP 1 i.HygieneGrade
                    FROM Inspection i
                    WHERE i.StallID = fs.StallID
                    ORDER BY i.InspectionDate DESC
                ) AS HygieneGrade,
                (
                    SELECT AVG(mi.ItemPrice)
                    FROM MenuItem mi
                    WHERE mi.StallID = fs.StallID
                ) AS AveragePrice,
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

              AND (
                    @Name IS NULL
                    OR fs.StallName LIKE '%' + @Name + '%'
              )
              AND (
                    @Cuisine IS NULL
                    OR EXISTS (
                        SELECT 1
                        FROM MenuItem mi
                        JOIN MenuItemCuisine mic
                            ON mi.MenuItemID = mic.MenuItemID
                        JOIN Cuisine c
                            ON mic.CuisineID = c.CuisineID
                        WHERE mi.StallID = fs.StallID
                          AND c.CuisineName = @Cuisine
                    )
              )
              AND (
                    @Area IS NULL
                    OR hc.Area = @Area
              )
              AND (
                    @Grade IS NULL
                    OR (
                        SELECT TOP 1 i.HygieneGrade
                        FROM Inspection i
                        WHERE i.StallID = fs.StallID
                        ORDER BY i.InspectionDate DESC
                    ) = @Grade
              )
            ORDER BY fs.StallName;
        `);

        return result.recordset;
    } catch (error) {
        console.error(
            "Database error (getAllStalls):",
            error
        );

        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Retrieve available filter options
async function getStallFilterOptions() {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const areas = await connection.request().query(`
            SELECT DISTINCT Area
            FROM HawkerCentre
            ORDER BY Area
        `);

        const cuisines = await connection.request().query(`
            SELECT DISTINCT CuisineName
            FROM Cuisine
            ORDER BY CuisineName
        `);

        return {
            areas: areas.recordset.map(area => area.Area),
            cuisines: cuisines.recordset.map(cuisine => cuisine.CuisineName),
            hygieneGrades: ["A", "B", "C", "D"]
        };

    } catch (error) {
        console.error("Database error:", error);
        throw error;
    } finally {
        if (connection) {
            connection.close();
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
    getStallFilterOptions,
    getStallById,
    getMenuItemsByStallId,
    getStallsByVendorId,
};