// Vendor Menu Model - Handles database operations that let a vendor manage the
// stall and the menu items belonging to their own food stall
const sql = require("mssql");
const dbConfig = require("../dbConfig");

/*
 * sql.connect() returns the connection pool shared by the whole application, so
 * closing it after a query would close it for every request that is still
 * running and those requests fail with ECONNCLOSED. The pool is therefore left
 * open here and app.js closes it once when the server shuts down.
 */

// Retrieve the owner of a stall so a vendor request can be authorised
async function getStallOwner(stallId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("StallID", sql.Int, stallId);

        const result = await request.query(`
            SELECT
                fs.StallID,
                fs.StallName,
                fs.VendorUserID
            FROM FoodStall fs
            WHERE fs.StallID = @StallID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getStallOwner):", error);
        throw error;
    }
}

// Retrieve one menu item, including the stall it belongs to
async function getMenuItemById(menuItemId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("MenuItemID", sql.Int, menuItemId);

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
                mi.CreatedAt
            FROM MenuItem mi
            WHERE mi.MenuItemID = @MenuItemID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getMenuItemById):", error);
        throw error;
    }
}

/*
 * Retrieve every menu item of a stall for the vendor view. Unlike the customer
 * listing this includes unavailable items, because a vendor has to see the
 * items that are currently sold out in order to bring them back.
 */
async function getMenuItemsForVendor(stallId) {
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
                mi.CreatedAt,
                orderUsage.TimesOrdered
            FROM MenuItem mi
            OUTER APPLY (
                SELECT COUNT(*) AS TimesOrdered
                FROM OrderItem oi
                WHERE oi.MenuItemID = mi.MenuItemID
            ) orderUsage
            WHERE mi.StallID = @StallID
            ORDER BY mi.ItemCategory, mi.ItemName;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getMenuItemsForVendor):", error);
        throw error;
    }
}

// Create a menu item for a stall
async function createMenuItem(stallId, menuItem) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("StallID", sql.Int, stallId);
        request.input("ItemName", sql.VarChar(100), menuItem.ItemName);
        request.input("ItemDesc", sql.VarChar(300), menuItem.ItemDesc || null);
        request.input("ItemPrice", sql.Decimal(6, 2), menuItem.ItemPrice);
        request.input("ItemCategory", sql.VarChar(40), menuItem.ItemCategory);
        request.input("ItemImage", sql.VarChar(255), menuItem.ItemImage || null);
        request.input("IsAvailable", sql.Bit, menuItem.IsAvailable ?? 1);

        const result = await request.query(`
            INSERT INTO MenuItem (
                StallID,
                ItemName,
                ItemDesc,
                ItemPrice,
                ItemCategory,
                ItemImage,
                IsAvailable
            )
            OUTPUT
                INSERTED.MenuItemID,
                INSERTED.StallID,
                INSERTED.ItemName,
                INSERTED.ItemDesc,
                INSERTED.ItemPrice AS Price,
                INSERTED.ItemCategory,
                INSERTED.ItemImage,
                INSERTED.IsAvailable,
                INSERTED.CreatedAt
            VALUES (
                @StallID,
                @ItemName,
                @ItemDesc,
                @ItemPrice,
                @ItemCategory,
                @ItemImage,
                @IsAvailable
            );
        `);

        return result.recordset[0];
    } catch (error) {
        console.error("Database error (createMenuItem):", error);
        throw error;
    }
}

// Update the details of an existing menu item
async function updateMenuItem(menuItemId, menuItem) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("MenuItemID", sql.Int, menuItemId);
        request.input("ItemName", sql.VarChar(100), menuItem.ItemName);
        request.input("ItemDesc", sql.VarChar(300), menuItem.ItemDesc || null);
        request.input("ItemPrice", sql.Decimal(6, 2), menuItem.ItemPrice);
        request.input("ItemCategory", sql.VarChar(40), menuItem.ItemCategory);
        request.input("ItemImage", sql.VarChar(255), menuItem.ItemImage || null);
        request.input("IsAvailable", sql.Bit, menuItem.IsAvailable);

        const result = await request.query(`
            UPDATE MenuItem
            SET
                ItemName = @ItemName,
                ItemDesc = @ItemDesc,
                ItemPrice = @ItemPrice,
                ItemCategory = @ItemCategory,
                ItemImage = @ItemImage,
                IsAvailable = @IsAvailable
            OUTPUT
                INSERTED.MenuItemID,
                INSERTED.StallID,
                INSERTED.ItemName,
                INSERTED.ItemDesc,
                INSERTED.ItemPrice AS Price,
                INSERTED.ItemCategory,
                INSERTED.ItemImage,
                INSERTED.IsAvailable,
                INSERTED.CreatedAt
            WHERE MenuItemID = @MenuItemID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (updateMenuItem):", error);
        throw error;
    }
}

// Mark a menu item as available or sold out
async function updateMenuItemAvailability(menuItemId, isAvailable) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("MenuItemID", sql.Int, menuItemId);
        request.input("IsAvailable", sql.Bit, isAvailable ? 1 : 0);

        const result = await request.query(`
            UPDATE MenuItem
            SET IsAvailable = @IsAvailable
            OUTPUT
                INSERTED.MenuItemID,
                INSERTED.StallID,
                INSERTED.ItemName,
                INSERTED.ItemPrice AS Price,
                INSERTED.IsAvailable
            WHERE MenuItemID = @MenuItemID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (updateMenuItemAvailability):", error);
        throw error;
    }
}

// Count how many times a menu item appears in past orders
async function countOrderItems(menuItemId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("MenuItemID", sql.Int, menuItemId);

        const result = await request.query(`
            SELECT COUNT(*) AS OrderItemCount
            FROM OrderItem
            WHERE MenuItemID = @MenuItemID;
        `);

        return result.recordset[0].OrderItemCount;
    } catch (error) {
        console.error("Database error (countOrderItems):", error);
        throw error;
    }
}

/*
 * Remove a menu item that has never been ordered. The cuisine links are removed
 * first because they reference the menu item. An item that appears in a past
 * order is never deleted, so order history keeps its item details.
 */
async function deleteMenuItem(menuItemId) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        const cuisineRequest = new sql.Request(transaction);
        cuisineRequest.input("MenuItemID", sql.Int, menuItemId);

        await cuisineRequest.query(`
            DELETE FROM MenuItemCuisine
            WHERE MenuItemID = @MenuItemID;
        `);

        const itemRequest = new sql.Request(transaction);
        itemRequest.input("MenuItemID", sql.Int, menuItemId);

        const result = await itemRequest.query(`
            DELETE FROM MenuItem
            WHERE MenuItemID = @MenuItemID;
        `);

        await transaction.commit();

        return result.rowsAffected[0] > 0;
    } catch (error) {
        console.error("Database error (deleteMenuItem):", error);

        if (transactionStarted) {
            await transaction.rollback();
        }

        throw error;
    }
}

// Update the stall details a vendor is allowed to change
async function updateStall(stallId, stall) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("StallID", sql.Int, stallId);
        request.input("StallName", sql.VarChar(80), stall.StallName);
        request.input("StallDesc", sql.VarChar(300), stall.StallDesc || null);
        request.input("StallImage", sql.VarChar(255), stall.StallImage || null);
        request.input("IsActive", sql.Bit, stall.IsActive ? 1 : 0);

        const result = await request.query(`
            UPDATE FoodStall
            SET
                StallName = @StallName,
                StallDesc = @StallDesc,
                StallImage = @StallImage,
                IsActive = @IsActive
            OUTPUT
                INSERTED.StallID,
                INSERTED.StallName,
                INSERTED.StallDesc AS Description,
                INSERTED.StallImage,
                INSERTED.IsActive,
                INSERTED.StallUnitNo,
                INSERTED.HawkerCentreID
            WHERE StallID = @StallID;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (updateStall):", error);
        throw error;
    }
}

module.exports = {
    getStallOwner,
    getMenuItemById,
    getMenuItemsForVendor,
    createMenuItem,
    updateMenuItem,
    updateMenuItemAvailability,
    countOrderItems,
    deleteMenuItem,
    updateStall,
};
