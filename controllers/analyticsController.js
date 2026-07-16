const sql = require("mssql");
const dbConfig = require("../dbConfig");

//helper function to check that the logged-in vendor owns the requested stall
async function verifyStallOwnership(pool, stallId, vendorId) {
  const result = await pool
    .request()
    .input("StallID", sql.Int, stallId)
    .query("SELECT VendorUserID FROM FoodStall WHERE StallID = @StallID");

  if (result.recordset.length === 0) {
    return { exists: false, isOwner: false };
  }

  const isOwner = result.recordset[0].VendorUserID === vendorId;
  return { exists: true, isOwner };
}

//get route for analytics and revenue and by stallid 
async function getRevenueAnalytics(req, res) {
  try {
    const { stallId } = req.params;
    const vendorId = req.user.id;

    const pool = await sql.connect(dbConfig);

    const ownership = await verifyStallOwnership(pool, stallId, vendorId);
    if (!ownership.exists) {
      return res.status(404).json({ error: "Stall does not exist." });
    }
    if (!ownership.isOwner) {
      return res.status(403).json({ error: "You do not have access to this stall's analytics." });
    }

    const result = await pool
      .request()
      .input("StallID", sql.Int, stallId)
      .query(`
        SELECT
          CAST(co.OrderDateTime AS DATE) AS RevenueDate,
          DATEPART(YEAR, co.OrderDateTime) AS RevenueYear,
          DATEPART(WEEK, co.OrderDateTime) AS RevenueWeek,
          DATEPART(MONTH, co.OrderDateTime) AS RevenueMonth,
          SUM(oi.Subtotal) AS TotalRevenue
        FROM CustomerOrder co
        JOIN OrderItem oi ON co.OrderID = oi.OrderID
        JOIN MenuItem mi ON oi.MenuItemID = mi.MenuItemID
        WHERE mi.StallID = @StallID
          AND co.OrderStatus = 'Completed'
        GROUP BY
          CAST(co.OrderDateTime AS DATE),
          DATEPART(YEAR, co.OrderDateTime),
          DATEPART(WEEK, co.OrderDateTime),
          DATEPART(MONTH, co.OrderDateTime)
        ORDER BY RevenueDate DESC
      `);

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while retrieving revenue analytics." });
  }
}

//get fucntion for analytics orders and by stallid
async function getOrderVolumeAnalytics(req, res) {
  try {
    const { stallId } = req.params;
    const vendorId = req.user.id;

    const pool = await sql.connect(dbConfig);

    const ownership = await verifyStallOwnership(pool, stallId, vendorId);
    if (!ownership.exists) {
      return res.status(404).json({ error: "Stall does not exist." });
    }
    if (!ownership.isOwner) {
      return res.status(403).json({ error: "You do not have access to this stall's analytics." });
    }

    const result = await pool
      .request()
      .input("StallID", sql.Int, stallId)
      .query(`
        SELECT
          co.OrderStatus,
          COUNT(DISTINCT co.OrderID) AS OrderCount
        FROM CustomerOrder co
        JOIN OrderItem oi ON co.OrderID = oi.OrderID
        JOIN MenuItem mi ON oi.MenuItemID = mi.MenuItemID
        WHERE mi.StallID = @StallID
        GROUP BY co.OrderStatus
      `);

    const totalOrders = result.recordset.reduce((sum, row) => sum + row.OrderCount, 0);

    res.status(200).json({
      totalOrders,
      breakdown: result.recordset,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while retrieving order volume analytics." });
  }
}

//get route analytics for the top-items through stall id
async function getTopSellingItems(req, res) {
  try {
    const { stallId } = req.params;
    const vendorId = req.user.id;

    const pool = await sql.connect(dbConfig);

    const ownership = await verifyStallOwnership(pool, stallId, vendorId);
    if (!ownership.exists) {
      return res.status(404).json({ error: "Stall does not exist." });
    }
    if (!ownership.isOwner) {
      return res.status(403).json({ error: "You do not have access to this stall's analytics." });
    }

    const result = await pool
      .request()
      .input("StallID", sql.Int, stallId)
      .query(`
        SELECT TOP 5
          mi.MenuItemID,
          mi.ItemName,
          SUM(oi.Quantity) AS TotalQuantitySold
        FROM OrderItem oi
        JOIN MenuItem mi ON oi.MenuItemID = mi.MenuItemID
        JOIN CustomerOrder co ON oi.OrderID = co.OrderID
        WHERE mi.StallID = @StallID
          AND co.OrderStatus = 'Completed'
        GROUP BY mi.MenuItemID, mi.ItemName
        ORDER BY TotalQuantitySold DESC
      `);

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while retrieving top-selling items." });
  }
}

module.exports = { getRevenueAnalytics, getOrderVolumeAnalytics, getTopSellingItems };