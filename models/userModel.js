// User Model - Handles database operations for User Registration and Login
const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Get user by email
async function getUserByEmail(email) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("Email", sql.VarChar(100), email);

        const result = await request.query(`
            SELECT UserID, Username, Email, PasswordHash, Role
            FROM UserAccount
            WHERE Email = @Email;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getUserByEmail):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Get user by username 
async function getUserByUsername(username) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("Username", sql.VarChar(50), username);

        const result = await request.query(`
            SELECT UserID, Username, Email, Role
            FROM UserAccount
            WHERE Username = @Username;
        `);

        return result.recordset[0] || null;
    } catch (error) {
        console.error("Database error (getUserByUsername):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Create a new user account
async function createUser(userData) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("Username", sql.VarChar(50), userData.Username);
        request.input("Email", sql.VarChar(100), userData.Email);
        request.input("PasswordHash", sql.VarChar(255), userData.PasswordHash);
        request.input("Role", sql.VarChar(20), userData.Role);

        const result = await request.query(`
            INSERT INTO UserAccount (Username, Email, PasswordHash, Role)
            VALUES (@Username, @Email, @PasswordHash, @Role);

            SELECT SCOPE_IDENTITY() AS UserID;
        `);

        const newId = Number(result.recordset[0].UserID);

        // Never return the password hash
        return {
            UserID: newId,
            Username: userData.Username,
            Email: userData.Email,
            Role: userData.Role,
        };
    } catch (error) {
        console.error("Database error (createUser):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

module.exports = {
    getUserByEmail,
    getUserByUsername,
    createUser,
};