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

// Create a new order
async function createOrder(orderData) {
    let connection;
    let transaction;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        // Transaction ensures order and order items are saved together
        await transaction.begin();

        let totalAmount = 0;
        const validatedItems = [];

        // Fetch prices from database instead of trusting frontend price
        for (const item of orderData.items) {
            const menuRequest = new sql.Request(transaction);
            menuRequest.input("MenuItemID", sql.Int, item.MenuItemID);

            const menuResult = await menuRequest.query(`
                SELECT MenuItemID, ItemPrice, IsAvailable
                FROM MenuItem
                WHERE MenuItemID = @MenuItemID;
            `);

            if (menuResult.recordset.length === 0) {
                throw new Error(`Menu item ${item.MenuItemID} does not exist`);
            }

            const menuItem = menuResult.recordset[0];

            if (!menuItem.IsAvailable) {
                throw new Error(`Menu item ${item.MenuItemID} is not available`);
            }

            const quantity = item.Quantity;
            const unitPrice = menuItem.ItemPrice;
            const subtotal = quantity * unitPrice;

            totalAmount += subtotal;

            validatedItems.push({
                MenuItemID: item.MenuItemID,
                Quantity: quantity,
                UnitPrice: unitPrice,
            });
        }

        // Insert main order record
        const orderRequest = new sql.Request(transaction);

        orderRequest.input("UserID", sql.Int, orderData.UserID || null);
        orderRequest.input("GuestName", sql.VarChar(80), orderData.GuestName || null);
        orderRequest.input("GuestEmail", sql.VarChar(100), orderData.GuestEmail || null);
        orderRequest.input("OrderType", sql.VarChar(20), orderData.OrderType);
        orderRequest.input("TotalAmount", sql.Decimal(8, 2), totalAmount);
        orderRequest.input(
            "SpecialInstructions",
            sql.VarChar(300),
            orderData.SpecialInstructions || null
        );

        const orderResult = await orderRequest.query(`
            INSERT INTO CustomerOrder
                (UserID, GuestName, GuestEmail, OrderType, TotalAmount, SpecialInstructions)
            VALUES
                (@UserID, @GuestName, @GuestEmail, @OrderType, @TotalAmount, @SpecialInstructions);

            SELECT SCOPE_IDENTITY() AS OrderID;
        `);

        const newOrderId = parseInt(orderResult.recordset[0].OrderID);

        // Insert food items for the order
        for (const item of validatedItems) {
            const itemRequest = new sql.Request(transaction);

            itemRequest.input("OrderID", sql.Int, newOrderId);
            itemRequest.input("MenuItemID", sql.Int, item.MenuItemID);
            itemRequest.input("Quantity", sql.Int, item.Quantity);
            itemRequest.input("UnitPrice", sql.Decimal(6, 2), item.UnitPrice);

            await itemRequest.query(`
                INSERT INTO OrderItem
                    (OrderID, MenuItemID, Quantity, UnitPrice)
                VALUES
                    (@OrderID, @MenuItemID, @Quantity, @UnitPrice);
            `);
        }

        await transaction.commit();

        return await getOrderById(newOrderId);
    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Rollback error:", rollbackError);
            }
        }

        console.error("Database error (createOrder):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Delete order by ID
async function deleteOrder(orderId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("OrderID", sql.Int, orderId);

        const result = await request.query(`
            DELETE FROM CustomerOrder
            WHERE OrderID = @OrderID;
        `);

        return result.rowsAffected[0] > 0;
    } catch (error) {
        console.error("Database error (deleteOrder):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}