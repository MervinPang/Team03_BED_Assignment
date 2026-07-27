const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Payment Model - Handles database operations for Checkout and Payment

// Retrieves payment records according to the authenticated user's role
// Customer : Payments belonging to their own order
// Vendor : Payments for orders placed with their food stalls
async function getAllPayments(user) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("UserID", sql.Int, user.id);
        request.input("Role", sql.VarChar(20), user.role);

        const result = await request.query(`
            SELECT
                p.PaymentID,
                p.OrderID,
                co.UserID,
                ISNULL(ua.Username, co.GuestName) AS CustomerName,
                p.PaymentMethod,
                p.PaymentStatus,
                p.Amount,
                p.TransactionReference,
                p.PaidAt,
                p.CreatedAt,
                co.OrderStatus,
                co.TotalAmount
            FROM Payment p
            JOIN CustomerOrder co ON p.OrderID = co.OrderID
            LEFT JOIN UserAccount ua ON co.UserID = ua.UserID
            WHERE
            (
                @Role='customer'
                AND co.UserID=@UserID
            )
            OR
            (
                @Role='vendor'
                AND EXISTS
                (
                    SELECT 1
                    FROM OrderItem oi
                    JOIN MenuItem mi
                        ON oi.MenuItemID=mi.MenuItemID
                    JOIN FoodStall fs
                        ON mi.StallID=fs.StallID
                    WHERE
                        oi.OrderID=co.OrderID
                        AND fs.VendorUserID=@UserID
                )
            )
            ORDER BY p.CreatedAt DESC;
        `);

        return result.recordset;
    } catch (error) {
        console.error("Database error (getAllPayments):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Retrieves a single payment while enforcing role-based ownership validation
async function getPaymentById(paymentId, user) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("PaymentID", sql.Int, paymentId);
        request.input("UserID", sql.Int, user?.id || null);
        request.input("Role", sql.VarChar(20), user?.role || null);

        const result = await request.query(`
            SELECT
                p.PaymentID,
                p.OrderID,
                co.UserID,
                ISNULL(ua.Username, co.GuestName) AS CustomerName,
                p.PaymentMethod,
                p.PaymentStatus,
                p.Amount,
                p.TransactionReference,
                p.PaidAt,
                p.CreatedAt,
                co.OrderStatus,
                co.TotalAmount
            FROM Payment p
            JOIN CustomerOrder co
                ON p.OrderID = co.OrderID
            LEFT JOIN UserAccount ua
                ON co.UserID = ua.UserID
            WHERE
                p.PaymentID = @PaymentID
                AND
                (
                    (
                        @Role='customer'
                        AND co.UserID = @UserID
                    )
                    OR
                    (
                        @Role='vendor'
                        AND EXISTS
                        (
                            SELECT 1
                            FROM OrderItem oi
                            JOIN MenuItem mi
                                ON oi.MenuItemID = mi.MenuItemID
                            JOIN FoodStall fs
                                ON mi.StallID = fs.StallID
                            WHERE
                                oi.OrderID = co.OrderID
                                AND fs.VendorUserID = @UserID
                        )
                    )
                );
            `);

        if (result.recordset.length === 0) {
            return null;
        }

        return result.recordset[0];
    } catch (error) {
        console.error("Database error (getPaymentById):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Retrieves payment information for a specific order, ensuring only authorised users can access it
async function getPaymentByOrderId(orderId, user) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();
        request.input("OrderID", sql.Int, orderId);
        request.input("UserID", sql.Int, user.id);
        request.input("Role", sql.VarChar(20), user.role);

        const result = await request.query(`
            SELECT
                p.PaymentID,
                p.OrderID,
                co.UserID,
                ISNULL(ua.Username, co.GuestName) AS CustomerName,
                p.PaymentMethod,
                p.PaymentStatus,
                p.Amount,
                p.TransactionReference,
                p.PaidAt,
                p.CreatedAt,
                co.OrderStatus,
                co.TotalAmount
            FROM Payment p
            JOIN CustomerOrder co ON p.OrderID = co.OrderID
            LEFT JOIN UserAccount ua ON co.UserID = ua.UserID
            WHERE
                p.OrderID = @OrderID
                AND (
                    (
                        @Role='customer'
                        AND co.UserID=@UserID
                    )
                    OR
                    (
                        @Role='vendor'
                        AND EXISTS (
                            SELECT 1
                            FROM OrderItem oi
                            JOIN MenuItem mi
                                ON oi.MenuItemID = mi.MenuItemID
                            JOIN FoodStall fs
                                ON mi.StallID = fs.StallID
                            WHERE
                                oi.OrderID = co.OrderID
                            AND fs.VendorUserID = @UserID
                        )
                    )
                );
            `);

        if (result.recordset.length === 0) {
            return null;
        }

        return result.recordset[0];
    } catch (error) {
        console.error("Database error (getPaymentByOrderId):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Creates a payment using a database transaction to
// ensure all related database operations succeed together
// If any step fails, the transaction is rolled back
// so no partial payment data is saved
async function createPayment(paymentData, user) {
    let connection;
    let transaction;
    let transactionStarted = false;
    let createdAccount = null;

    try {
        // Open the database connection
        connection = await sql.connect(dbConfig);

        // Create and start the database transaction
        transaction = new sql.Transaction(connection);
        await transaction.begin();
        transactionStarted = true;

        // Guests authenticate ownership using the unique
        // GuestOrderReference generated during order creation,
        // allowing secure guest checkout without requiring an account
        if (!user && !paymentData.GuestOrderReference) {
            throw new Error(
                "Guest order reference is required for guest checkout"
            );
        }

        // Only authenticated customers may perform member checkout
        // Vendors and NEA officers are not allowed to create payments
        if (user && user.role !== "customer") {
            throw new Error(
                "Only customers can create payments"
            );
        }

        // Account registration during checkout is only available for guest orders
        if (user && paymentData.AccountRegistration) {
            throw new Error(
                "Account registration is only available for guest checkout"
            );
        }

        // Always retrieve the payable amount from the database instead of trusting values supplied by the client.
        // This prevents payment amount manipulation
        const orderRequest = new sql.Request(transaction);
        const userId = user?.id || null;
        const userRole = user?.role || null;
        const guestOrderReference = paymentData.GuestOrderReference || null;

        orderRequest.input("OrderID", sql.Int, paymentData.OrderID);
        orderRequest.input("UserID", sql.Int, userId);
        orderRequest.input("Role", sql.VarChar(20), userRole);
        orderRequest.input("GuestOrderReference", sql.VarChar(50), guestOrderReference);

        const orderResult = await orderRequest.query(`
            SELECT OrderID, UserID, GuestName, GuestEmail, GuestOrderReference, OrderType,
            TotalAmount, OrderStatus
            FROM CustomerOrder
            WHERE
                OrderID = @OrderID
                AND
                (
                    (
                        @Role = 'customer'
                        AND UserID = @UserID
                    )
                    OR
                    (
                        @Role IS NULL
                        AND UserID IS NULL
                        AND OrderType = 'Guest'
                        AND GuestOrderReference = @GuestOrderReference
                    )
                );
            `);

        if (orderResult.recordset.length === 0) {
            throw new Error("Order does not exist or you do not have access to this order");
        }

        const order = orderResult.recordset[0];

        // Payment are only accepted while the order is pending
        // To prevent duplicate or late payment attempts
        if (order.OrderStatus !== "Pending") {
            throw new Error(
                "Payment can only be made for a pending order"
            );
        }

        // Prevent multiple payments from being created for the same customer order.
        const existingPaymentRequest = new sql.Request(transaction);
        existingPaymentRequest.input("OrderID", sql.Int, paymentData.OrderID);

        const existingPaymentResult = await existingPaymentRequest.query(`
            SELECT PaymentID
            FROM Payment
            WHERE OrderID = @OrderID;
        `);

        if (existingPaymentResult.recordset.length > 0) {
            throw new Error("Payment has already been made for this order");
        }

        // Optionally create a customer account using the information
        // already provided during guest checkout
        if (paymentData.AccountRegistration) {
            if (order.OrderType !== "Guest" || order.UserID !== null) {
                throw new Error(
                    "Only guest orders can be linked to a new account"
                );
            }

            if (!order.GuestEmail) {
                throw new Error(
                    "Guest email is required to create an account"
                );
            }

            const accountRegistration =
                paymentData.AccountRegistration;

            // Check whether the username or guest email is already registered
            const existingAccountRequest = new sql.Request(transaction);

            existingAccountRequest.input("Username", sql.VarChar(50), accountRegistration.Username);
            existingAccountRequest.input("Email", sql.VarChar(100), order.GuestEmail);

            const existingAccountResult =
                await existingAccountRequest.query(`
            SELECT UserID, Username, Email
            FROM UserAccount
            WHERE
                Username = @Username
                OR Email = @Email;
        `);

            if (existingAccountResult.recordset.length > 0) {
                const existingAccount = existingAccountResult.recordset[0];

                if (
                    existingAccount.Username.toLowerCase() === accountRegistration.Username.toLowerCase()
                ) {
                    throw new Error(
                        "Username is already registered"
                    );
                }

                throw new Error(
                    "Email is already registered"
                );
            }

            // PasswordHash was created securely in paymentController
            const createAccountRequest = new sql.Request(transaction);

            createAccountRequest.input("Username", sql.VarChar(50), accountRegistration.Username);
            createAccountRequest.input("Email", sql.VarChar(100), order.GuestEmail);
            createAccountRequest.input("PasswordHash", sql.VarChar(255), accountRegistration.PasswordHash);
            createAccountRequest.input("Role", sql.VarChar(20), "customer");

            const createAccountResult =
                await createAccountRequest.query(`
            INSERT INTO UserAccount
                (Username, Email, PasswordHash, Role)
            VALUES
                (@Username, @Email, @PasswordHash, @Role);

            SELECT SCOPE_IDENTITY() AS UserID;
        `);

            const newUserId = Number(createAccountResult.recordset[0].UserID);

            createdAccount = {
                UserID: newUserId,
                Username: accountRegistration.Username,
                Email: order.GuestEmail,
                Role: "customer",
            };

            // Convert the guest order into a member order so it
            // appears in the newly created customer's order history
            const linkOrderRequest = new sql.Request(transaction);

            linkOrderRequest.input("OrderID", sql.Int, paymentData.OrderID);
            linkOrderRequest.input("UserID", sql.Int, newUserId);

            const linkOrderResult =
                await linkOrderRequest.query(`
            UPDATE CustomerOrder
            SET
                UserID = @UserID,
                OrderType = 'Member',
                GuestName = NULL,
                GuestEmail = NULL,
                GuestOrderReference = NULL,
                UpdatedAt = GETDATE()
            WHERE
                OrderID = @OrderID
                AND OrderType = 'Guest'
                AND UserID IS NULL;
        `);

            if (linkOrderResult.rowsAffected[0] === 0) {
                throw new Error(
                    "Guest order could not be linked to the new account"
                );
            }
        }

        // The server determines the initial payment status
        // Cash payments remain pending until confirmed,
        // while simulated electronic payments are marked successful immediately
        const paymentStatus =
            paymentData.PaymentMethod === "Cash" ? "Pending" : "Successful";

        const paidAt = paymentStatus === "Successful" ? new Date() : null;

        // Cash may have no reference, while Card and PayNow
        // References are enforced by Joi validation
        const transactionReference = paymentData.TransactionReference || null;
        const paymentRequest = new sql.Request(transaction);

        paymentRequest.input("OrderID", sql.Int, paymentData.OrderID);
        paymentRequest.input("PaymentMethod", sql.VarChar(30), paymentData.PaymentMethod);
        paymentRequest.input("PaymentStatus", sql.VarChar(30), paymentStatus);
        paymentRequest.input("Amount", sql.Decimal(10, 2), order.TotalAmount);
        paymentRequest.input("TransactionReference", sql.VarChar(100), transactionReference);
        paymentRequest.input("PaidAt", sql.DateTime, paidAt);

        const paymentResult = await paymentRequest.query(`
            INSERT INTO Payment
                (OrderID, PaymentMethod, PaymentStatus, Amount, TransactionReference, PaidAt)
            VALUES
                (@OrderID, @PaymentMethod, @PaymentStatus, @Amount, @TransactionReference, @PaidAt);

            SELECT SCOPE_IDENTITY() AS PaymentID;
        `);

        const newPaymentId = Number(paymentResult.recordset[0].PaymentID);

        // Commit the transaction only after every validation
        // and database operation has completed successfully.
        await transaction.commit();
        transactionStarted = false;

        // Retrieve the created payment for both member and guest checkout
        const createdPayment = await getCreatedPaymentById(newPaymentId);

        createdPayment.AccountCreated = createdAccount !== null;
        createdPayment.Account = createdAccount;

        return createdPayment;
    } catch (error) {
        // Roll back the entire transaction whenever an error occurs to maintain database consistency
        if (transaction && transactionStarted) {
            try {
                await transaction.rollback(); // Roll back all changes if an error occurs
                transactionStarted = false;
            } catch (rollbackError) {
                console.error("Rollback error:", rollbackError);
            }
        }

        if (error.number === 2601 || error.number === 2627) {
            if (
                error.message.includes("UX_Payment_TransactionReference")
            ) {
                throw new Error("Transaction reference has already been used");
            }

            if (
                error.message.includes("UQ_Payment_OrderID")
            ) {
                throw new Error("Payment has already been made for this order");
            }
        }

        console.error("Database error (createPayment):", error);
        throw error;
    } finally {
        if (connection) await connection.close();
    }
}

// Internal helper used immediately after payment creation
// to return the newly inserted payment details
async function getCreatedPaymentById(paymentId) {
    let connection;

    try {
        connection = await sql.connect(dbConfig);

        const request = connection.request();

        request.input("PaymentID", sql.Int, paymentId);

        const result = await request.query(`
            SELECT p.PaymentID, p.OrderID, p.PaymentMethod, p.PaymentStatus, p.Amount,
                p.TransactionReference, p.PaidAt, p.CreatedAt, co.OrderStatus, co.TotalAmount
            FROM Payment p
            JOIN CustomerOrder co
                ON p.OrderID = co.OrderID
            WHERE
                p.PaymentID = @PaymentID;
        `);

        if (result.recordset.length === 0) {
            return null;
        }

        return result.recordset[0];
    } catch (error) {
        console.error("Database error (getCreatedPaymentById):", error);

        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Updates the lifecycle status of a payment
// Vendor ownership is verified and payment status
// transitions follow predefined business rules
async function updatePaymentStatus(paymentId, paymentStatus, user) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        // Retrieve the current payment status and verify vendor ownership
        const currentPaymentRequest = new sql.Request(transaction);

        currentPaymentRequest.input(
            "PaymentID",
            sql.Int,
            paymentId
        );

        currentPaymentRequest.input(
            "UserID",
            sql.Int,
            user.id
        );

        const currentPaymentResult =
            await currentPaymentRequest.query(`
                SELECT
                    p.PaymentID,
                    p.PaymentStatus,
                    p.PaidAt
                FROM Payment p
                JOIN CustomerOrder co
                    ON p.OrderID = co.OrderID
                WHERE
                    p.PaymentID = @PaymentID
                    AND EXISTS
                    (
                        SELECT 1
                        FROM OrderItem oi
                        JOIN MenuItem mi
                            ON oi.MenuItemID = mi.MenuItemID
                        JOIN FoodStall fs
                            ON mi.StallID = fs.StallID
                        WHERE
                            oi.OrderID = co.OrderID
                            AND fs.VendorUserID = @UserID
                    );
            `);

        if (currentPaymentResult.recordset.length === 0) {
            await transaction.rollback();
            transactionStarted = false;
            return null;
        }

        const currentPayment =
            currentPaymentResult.recordset[0];

        const currentStatus =
            currentPayment.PaymentStatus;

        // State transition rules ensure payment statuses
        // progress through valid business workflows only
        const allowedTransitions = {
            Pending: ["Successful", "Failed"],
            Successful: ["Refunded"],
            Failed: ["Pending"],
            Refunded: [],
        };

        const allowedNextStatuses =
            allowedTransitions[currentStatus] || [];

        if (!allowedNextStatuses.includes(paymentStatus)) {
            throw new Error(
                `Payment status cannot be changed from ${currentStatus} to ${paymentStatus}`
            );
        }

        const updateRequest = new sql.Request(transaction);

        updateRequest.input("PaymentID", sql.Int, paymentId);

        updateRequest.input("PaymentStatus", sql.VarChar(30), paymentStatus);

        await updateRequest.query(`
            UPDATE Payment
            SET
                PaymentStatus = @PaymentStatus,
                PaidAt =
                    CASE
                        WHEN @PaymentStatus = 'Successful'
                             AND PaidAt IS NULL
                            THEN GETDATE()
                        ELSE PaidAt
                    END
            WHERE PaymentID = @PaymentID;
        `);

        await transaction.commit();
        transactionStarted = false;

        return await getPaymentById(paymentId, user);
    } catch (error) {
        if (transaction && transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error(
                    "Rollback error:",
                    rollbackError
                );
            }
        }

        console.error(
            "Database error (updatePaymentStatus):",
            error
        );

        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Changes the method of an existing pending payment.
// The update is performed atomically so the order is never left
// without a payment record.
async function updatePaymentMethod(paymentId, paymentData, user) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        const currentRequest = new sql.Request(transaction);

        currentRequest.input("PaymentID", sql.Int, paymentId);
        currentRequest.input("UserID", sql.Int, user?.id || null);
        currentRequest.input("Role", sql.VarChar(20), user?.role || null);
        currentRequest.input("GuestOrderReference", sql.VarChar(50), paymentData.GuestOrderReference || null);

        const currentResult =
            await currentRequest.query(`
                SELECT
                    p.PaymentID,
                    p.OrderID,
                    p.PaymentMethod,
                    p.PaymentStatus,
                    p.TransactionReference,
                    p.PaidAt,
                    co.UserID,
                    co.OrderType,
                    co.OrderStatus,
                    co.GuestOrderReference
                FROM Payment p
                JOIN CustomerOrder co
                    ON p.OrderID = co.OrderID
                WHERE
                    p.PaymentID = @PaymentID
                    AND
                    (
                        (
                            @Role = 'customer'
                            AND co.UserID = @UserID
                        )
                        OR
                        (
                            @Role IS NULL
                            AND co.UserID IS NULL
                            AND co.OrderType = 'Guest'
                            AND co.GuestOrderReference =
                                @GuestOrderReference
                        )
                    );
            `);

        if (currentResult.recordset.length === 0) {
            await transaction.rollback();
            transactionStarted = false;

            return null;
        }

        const currentPayment = currentResult.recordset[0];

        if (currentPayment.OrderStatus !== "Pending") {
            throw new Error(
                "Payment method can only be changed while the order is pending"
            );
        }

        if (
            !["Pending", "Failed"].includes(
                currentPayment.PaymentStatus
            )
        ) {
            throw new Error(
                "Only pending or failed payments can change payment method"
            );
        }

        const nextPaymentStatus =
            paymentData.PaymentMethod === "Cash" ? "Pending" : "Successful";

        const nextTransactionReference =
            paymentData.PaymentMethod === "Cash" ? null : paymentData.TransactionReference;

        const nextPaidAt =
            nextPaymentStatus === "Successful" ? new Date() : null;

        if (nextTransactionReference) {
            const duplicateRequest = new sql.Request(transaction);

            duplicateRequest.input("PaymentID", sql.Int, paymentId);
            duplicateRequest.input("TransactionReference", sql.VarChar(100), nextTransactionReference);

            const duplicateResult =
                await duplicateRequest.query(`
                    SELECT PaymentID
                    FROM Payment
                    WHERE
                        TransactionReference =
                            @TransactionReference
                        AND PaymentID <> @PaymentID;
                `);

            if (duplicateResult.recordset.length > 0) {
                throw new Error(
                    "Transaction reference has already been used"
                );
            }
        }

        const updateRequest =
            new sql.Request(transaction);

        updateRequest.input("PaymentID", sql.Int, paymentId);
        updateRequest.input("PaymentMethod", sql.VarChar(30), paymentData.PaymentMethod);
        updateRequest.input("PaymentStatus", sql.VarChar(30), nextPaymentStatus);
        updateRequest.input("TransactionReference", sql.VarChar(100), nextTransactionReference);
        updateRequest.input("PaidAt", sql.DateTime, nextPaidAt);

        const updateResult =
            await updateRequest.query(`
                UPDATE Payment
                SET
                    PaymentMethod =
                        @PaymentMethod,
                    PaymentStatus =
                        @PaymentStatus,
                    TransactionReference =
                        @TransactionReference,
                    PaidAt =
                        @PaidAt
                WHERE PaymentID =
                    @PaymentID;
            `);

        if (updateResult.rowsAffected[0] === 0) {
            await transaction.rollback();
            transactionStarted = false;

            return null;
        }

        await transaction.commit();
        transactionStarted = false;

        return await getCreatedPaymentById(
            paymentId
        );
    } catch (error) {
        if (transaction && transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error(
                    "Rollback error:",
                    rollbackError
                );
            }
        }

        if (
            error.number === 2601 ||
            error.number === 2627
        ) {
            if (
                error.message.includes(
                    "UX_Payment_TransactionReference"
                )
            ) {
                throw new Error(
                    "Transaction reference has already been used"
                );
            }
        }

        console.error(
            "Database error (updatePaymentMethod):",
            error
        );

        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Deletes an eligible payment using a transaction
// Completed records are preserved to maintain payment integrity and auditability.
async function deletePayment(paymentId, user) {
    let connection;
    let transaction;
    let transactionStarted = false;

    try {
        connection = await sql.connect(dbConfig);
        transaction = new sql.Transaction(connection);

        await transaction.begin();
        transactionStarted = true;

        // Verify payment ownership and retrieve its current state
        const paymentRequest = new sql.Request(transaction);

        paymentRequest.input("PaymentID", sql.Int, paymentId);
        paymentRequest.input("UserID", sql.Int, user.id);

        const paymentResult = await paymentRequest.query(`
            SELECT
                p.PaymentID,
                p.PaymentStatus,
                co.OrderID,
                co.OrderStatus
            FROM Payment p
            JOIN CustomerOrder co
                ON p.OrderID = co.OrderID
            WHERE
                p.PaymentID = @PaymentID
                AND co.UserID = @UserID;
        `);
        if (paymentResult.recordset.length === 0) {
            await transaction.rollback();
            transactionStarted = false;
            return null;
        }

        const payment = paymentResult.recordset[0];

        // Completed financial transactions are retained
        // to preserve accounting records and audit history
        if (
            payment.PaymentStatus === "Successful" ||
            payment.PaymentStatus === "Refunded"
        ) {
            throw new Error(
                "Successful or refunded payments cannot be deleted"
            );
        }

        // Payments may only be removed while the associated
        // order remains pending, preventing inconsistencies
        // once order processing has begun
        if (payment.OrderStatus !== "Pending") {
            throw new Error(
                "Payments can only be deleted for pending orders"
            );
        }

        const deleteRequest = new sql.Request(transaction);
        deleteRequest.input("PaymentID", sql.Int, paymentId);

        const result = await deleteRequest.query(`
            DELETE FROM Payment
            WHERE PaymentID = @PaymentID;
        `);
        await transaction.commit();
        transactionStarted = false;

        return result.rowsAffected[0] > 0;

    } catch (error) {
        if (transaction && transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Rollback error:", rollbackError);
            }
        }

        console.error("Database error (deletePayment):", error);
        throw error;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

// Export model functions for use in PaymentController
module.exports = {
    createPayment,
    getAllPayments,
    getPaymentById,
    getPaymentByOrderId,
    updatePaymentStatus,
    updatePaymentMethod,
    deletePayment,
};