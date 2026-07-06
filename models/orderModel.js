const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Get all orders
async function getAllOrders() {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const result = await connection.request().query(`
            SELECT
                co.OrderID,
                co.OrderType,
                co.OrderStatus,
                ISNULL(ua.Username, co.GuestName) AS CustomerName,
                co.TotalAmount,
                co.OrderDateTime,
                co.UpdatedAt
            FROM CustomerOrder co
            LEFT JOIN UserAccount ua ON co.UserID = ua.UserID
            ORDER BY co.OrderDateTime DESC;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getAllOrders):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Get full order details by ID
async function getOrderById(orderId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const orderRequest = connection.request();
        orderRequest.input("OrderID", sql.Int, orderId);

        const orderResult = await orderRequest.query(`
            SELECT 
                co.OrderID,
                co.UserID,
                co.GuestName,
                co.GuestEmail,
                co.OrderType,
                co.OrderStatus,
                co.TotalAmount,
                co.SpecialInstructions,
                co.OrderDateTime,
                co.UpdatedAt,
                ISNULL(ua.Username, co.GuestName) AS CustomerName
            FROM CustomerOrder co
            LEFT JOIN UserAccount ua ON co.UserID = ua.UserID
            WHERE co.OrderID = @OrderID;
        `);

        if (orderResult.recordset.length === 0) {
            return null;
        }

        const itemRequest = connection.request();
        itemRequest.input("OrderID", sql.Int, orderId);

        const itemResult = await itemRequest.query(`
            SELECT
                oi.OrderItemID,
                oi.MenuItemID,
                mi.ItemName,
                fs.StallName,
                oi.Quantity,
                oi.UnitPrice,
                oi.Subtotal
            FROM OrderItem oi
            JOIN MenuItem mi ON oi.MenuItemID = mi.MenuItemID
            JOIN FoodStall fs ON mi.StallID = fs.StallID
            WHERE oi.OrderID = @OrderID;
        `);

        return {
            ...orderResult.recordset[0],
            items: itemResult.recordset,
        };
    } catch (error) {
        console.error("Database error (getOrderById):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}