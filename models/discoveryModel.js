// Discovery Model - Handles database operations for searching hawker centres by
// area and for filtering food stalls by price range and NEA hygiene grade
const sql = require("mssql");
const dbConfig = require("../dbConfig");

/*
 * sql.connect() returns the connection pool shared by the whole application, so
 * closing it after a query would close it for every request that is still
 * running and those requests fail with ECONNCLOSED. The pool is therefore left
 * open here and app.js closes it once when the server shuts down.
 */

/*
 * A stall carries the hygiene grade of its most recent inspection and the price
 * range of the menu items it currently sells. Both are read with OUTER APPLY so
 * a stall that has never been inspected, or that has no available menu item,
 * is still returned instead of disappearing from the results.
 */
const STALL_GRADE_APPLY = `
    OUTER APPLY (
        SELECT TOP 1
            i.HygieneGrade,
            i.InspectionDate
        FROM Inspection i
        WHERE i.StallID = fs.StallID
        ORDER BY i.InspectionDate DESC, i.InspectionID DESC
    ) grade
`;

const STALL_PRICE_APPLY = `
    OUTER APPLY (
        SELECT
            AVG(mi.ItemPrice) AS AveragePrice,
            MIN(mi.ItemPrice) AS LowestPrice,
            MAX(mi.ItemPrice) AS HighestPrice,
            COUNT(*) AS MenuItemCount
        FROM MenuItem mi
        WHERE mi.StallID = fs.StallID
          AND mi.IsAvailable = 1
    ) price
`;

/*
 * The Area column is added by sql/Enhancement_AreaSearch.sql. Until that script
 * has been run the price and hygiene grade features must still work, so every
 * query checks for the column instead of assuming it exists. A column that has
 * been found cannot disappear, so only a positive result is remembered.
 */
let areaColumnFound = false;

async function hasAreaColumn(connection) {
    if (areaColumnFound) {
        return true;
    }

    const result = await connection.request().query(`
        SELECT COL_LENGTH('dbo.HawkerCentre', 'Area') AS AreaColumn;
    `);

    areaColumnFound = result.recordset[0].AreaColumn !== null;

    return areaColumnFound;
}

// Retrieve every area that currently has a hawker centre
async function getAreas() {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        // Without the column there is no area to browse by
        if (!(await hasAreaColumn(connection))) {
            return [];
        }

        const result = await connection.request().query(`
            SELECT
                hc.Area,
                COUNT(DISTINCT hc.HawkerCentreID) AS CentreCount,
                COUNT(fs.StallID) AS StallCount
            FROM HawkerCentre hc
            LEFT JOIN FoodStall fs
                ON hc.HawkerCentreID = fs.HawkerCentreID
                AND fs.IsActive = 1
            WHERE hc.Area IS NOT NULL
            GROUP BY hc.Area
            ORDER BY hc.Area;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getAreas):", error);
        throw error;
    }
}

// Retrieve hawker centres with the figures needed to compare them.
// An empty area returns every centre
async function getHawkerCentres(area) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const areaAvailable = await hasAreaColumn(connection);

        const request = connection.request();
        request.input("Area", sql.VarChar(50), area || null);

        const result = await request.query(`
            SELECT
                hc.HawkerCentreID,
                hc.HCName,
                hc.HCAddress,
                ${areaAvailable
                ? "hc.Area"
                : "CAST(NULL AS VARCHAR(50)) AS Area"},
                centre.StallCount,
                centre.AveragePrice,
                centre.LowestPrice,
                centre.GradeA,
                centre.GradeB,
                centre.GradeC,
                centre.GradeD,
                centre.Ungraded
            FROM HawkerCentre hc
            OUTER APPLY (
                SELECT
                    COUNT(*) AS StallCount,
                    AVG(stallPrice.AveragePrice) AS AveragePrice,
                    MIN(stallPrice.LowestPrice) AS LowestPrice,
                    SUM(CASE WHEN stallGrade.HygieneGrade = 'A' THEN 1 ELSE 0 END) AS GradeA,
                    SUM(CASE WHEN stallGrade.HygieneGrade = 'B' THEN 1 ELSE 0 END) AS GradeB,
                    SUM(CASE WHEN stallGrade.HygieneGrade = 'C' THEN 1 ELSE 0 END) AS GradeC,
                    SUM(CASE WHEN stallGrade.HygieneGrade = 'D' THEN 1 ELSE 0 END) AS GradeD,
                    SUM(CASE WHEN stallGrade.HygieneGrade IS NULL THEN 1 ELSE 0 END) AS Ungraded
                FROM FoodStall fs
                OUTER APPLY (
                    SELECT TOP 1 i.HygieneGrade
                    FROM Inspection i
                    WHERE i.StallID = fs.StallID
                    ORDER BY i.InspectionDate DESC, i.InspectionID DESC
                ) stallGrade
                OUTER APPLY (
                    SELECT
                        AVG(mi.ItemPrice) AS AveragePrice,
                        MIN(mi.ItemPrice) AS LowestPrice
                    FROM MenuItem mi
                    WHERE mi.StallID = fs.StallID
                      AND mi.IsAvailable = 1
                ) stallPrice
                WHERE fs.HawkerCentreID = hc.HawkerCentreID
                  AND fs.IsActive = 1
            ) centre
            ${areaAvailable
                ? "WHERE (@Area IS NULL OR hc.Area = @Area)"
                : ""}
            ORDER BY ${areaAvailable ? "hc.Area, " : ""}hc.HCName;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getHawkerCentres):", error);
        throw error;
    }
}

// Confirm a hawker centre exists before its stalls are requested
async function getHawkerCentreById(hawkerCentreId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const areaAvailable = await hasAreaColumn(connection);

        const request = connection.request();
        request.input("HawkerCentreID", sql.Int, hawkerCentreId);

        const result = await request.query(`
            SELECT
                hc.HawkerCentreID,
                hc.HCName,
                hc.HCAddress,
                ${areaAvailable
                ? "hc.Area"
                : "CAST(NULL AS VARCHAR(50)) AS Area"}
            FROM HawkerCentre hc
            WHERE hc.HawkerCentreID = @HawkerCentreID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getHawkerCentreById):", error);
        throw error;
    }
}

/*
 * Search active food stalls using any combination of area, hygiene grade and
 * price range. Every filter is optional, so a request without filters returns
 * the same stalls as the stall listing with the comparison figures added.
 */
async function searchStalls(filters = {}) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const areaAvailable = await hasAreaColumn(connection);

        const request = connection.request();
        request.input("Area", sql.VarChar(50), filters.area || null);
        request.input("HawkerCentreID", sql.Int, filters.hawkerCentreId || null);
        request.input("Grades", sql.VarChar(20), filters.grades?.join(",") || null);
        request.input("MinPrice", sql.Decimal(6, 2), filters.minPrice ?? null);
        request.input("MaxPrice", sql.Decimal(6, 2), filters.maxPrice ?? null);

        // The sort option is mapped to a fixed ORDER BY instead of being
        // placed into the statement, so no user input reaches the SQL text
        const orderByClauses = {
            name: "fs.StallName",
            price_asc: "price.AveragePrice ASC, fs.StallName",
            price_desc: "price.AveragePrice DESC, fs.StallName",
            grade: "CASE WHEN grade.HygieneGrade IS NULL THEN 1 ELSE 0 END, grade.HygieneGrade, fs.StallName",
        };

        const orderBy = orderByClauses[filters.sort] || orderByClauses.name;

        const result = await request.query(`
            SELECT
                fs.StallID,
                fs.StallName,
                fs.StallDesc AS Description,
                fs.StallImage,
                fs.IsActive AS IsAvailable,
                fs.StallUnitNo,
                hc.HawkerCentreID,
                hc.HCName,
                hc.HCAddress,
                ${areaAvailable
                ? "hc.Area"
                : "CAST(NULL AS VARCHAR(50)) AS Area"},
                grade.HygieneGrade,
                grade.InspectionDate AS LastInspectionDate,
                price.AveragePrice,
                price.LowestPrice,
                price.HighestPrice,
                price.MenuItemCount,
                matching.MatchingItemCount,
                cuisineData.Cuisine
            FROM FoodStall fs
            JOIN HawkerCentre hc
                ON fs.HawkerCentreID = hc.HawkerCentreID
            ${STALL_GRADE_APPLY}
            ${STALL_PRICE_APPLY}
            OUTER APPLY (
                SELECT COUNT(*) AS MatchingItemCount
                FROM MenuItem mi
                WHERE mi.StallID = fs.StallID
                  AND mi.IsAvailable = 1
                  AND (@MinPrice IS NULL OR mi.ItemPrice >= @MinPrice)
                  AND (@MaxPrice IS NULL OR mi.ItemPrice <= @MaxPrice)
            ) matching
            OUTER APPLY (
                SELECT STRING_AGG(distinctCuisines.CuisineName, ', ') AS Cuisine
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
              ${areaAvailable
                ? "AND (@Area IS NULL OR hc.Area = @Area)"
                : ""}
              AND (@HawkerCentreID IS NULL OR hc.HawkerCentreID = @HawkerCentreID)
              AND (
                    @Grades IS NULL
                    OR grade.HygieneGrade IN (
                        SELECT LTRIM(RTRIM(value))
                        FROM STRING_SPLIT(@Grades, ',')
                    )
                  )
              AND (
                    (@MinPrice IS NULL AND @MaxPrice IS NULL)
                    OR matching.MatchingItemCount > 0
                  )
            ORDER BY ${orderBy};
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (searchStalls):", error);
        throw error;
    }
}

module.exports = {
    getAreas,
    getHawkerCentres,
    getHawkerCentreById,
    searchStalls,
};