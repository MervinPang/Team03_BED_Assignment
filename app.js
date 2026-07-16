const express = require("express");
const sql = require("mssql");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config();

const orderController = require("./controllers/orderController");
const orderHistoryController = require("./controllers/orderHistoryController");
const paymentController = require("./controllers/paymentController");
const userController = require("./controllers/userController");
const inspectionController = require("./controllers/inspectionController");
const complaintController = require("./controllers/complaintController");

const {
    validateOrder,
    validateOrderStatus,
    validateOrderId,
} = require("./middlewares/orderValidation"); // Import Order Validation Middleware

const {
    validateOrderHistoryId,
    validateGuestOrderHistory,
} = require("./middlewares/orderHistoryValidation"); // Import Order History Validation Middlware

const {
    validatePayment,
    validatePaymentStatus,
    validatePaymentId,
    validateOrderIdParam,
} = require("./middlewares/paymentValidation"); // Import Payment Validation Middleware

const {
    validateRegistration,
    validateLogin,
} = require("./middlewares/userValidation"); // Import User Validation Middleware

const { verifyJWT, optionalJWT } = require("./middlewares/authMiddleware"); // Import JWT Authorization Middleware

const { validateInspection } = require("./middlewares/inspectionValidation"); // Import Inspection Validation Middleware

const { validateComplaint, validateComplaintStatus } = require("./middlewares/complaintValidation");

const feedbackController = require("./controllers/feedbackController");

const { validateFeedback, validateReviewId, } = require("./middlewares/feedbackValidation"); // Import Feedback Validation Middleware

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// Routes for Place Food Order
app.get("/orders", verifyJWT, orderController.getAllOrders);
app.get("/orders/:id", validateOrderId, verifyJWT, orderController.getOrderById);
app.post("/orders", optionalJWT, validateOrder, orderController.createOrder);
app.put("/orders/:id/status", validateOrderId, verifyJWT, validateOrderStatus, orderController.updateOrderStatus);
app.delete("/orders/:id", validateOrderId, verifyJWT, orderController.deleteOrder);

// Routes for Order History
app.get("/order-history/active", verifyJWT, orderHistoryController.getActiveOrderHistory);
app.get("/order-history/previous",verifyJWT,orderHistoryController.getPreviousOrderHistory);
app.post("/order-history/guest",validateGuestOrderHistory,orderHistoryController.getGuestOrderHistory);
app.get("/order-history/:id",verifyJWT,validateOrderHistoryId,orderHistoryController.getOrderHistoryById);

// Routes for Checkout and Payment
app.get("/payments", verifyJWT, paymentController.getAllPayments);
app.get("/payments/:id", verifyJWT, validatePaymentId, paymentController.getPaymentById);
app.get("/payments/order/:orderId", verifyJWT, validateOrderIdParam, paymentController.getPaymentByOrderId);
app.post("/payments", verifyJWT, validatePayment, paymentController.createPayment);
app.put("/payments/:id/status", verifyJWT, validatePaymentId, validatePaymentStatus, paymentController.updatePaymentStatus);
app.delete("/payments/:id", verifyJWT, validatePaymentId, paymentController.deletePayment);

// Routes for User Registration and Login
app.post("/register", validateRegistration, userController.registerUser);
app.post("/login", validateLogin, userController.loginUser);

// Routes for Inspections
app.post("/inspections", verifyJWT, validateInspection, inspectionController.submitInspection);
app.get("/inspections/:stallId", verifyJWT, inspectionController.getInspectionHistory);

//Routes for complaints 
app.post("/complaints", verifyJWT, validateComplaint, complaintController.submitComplaint);
app.get("/complaints/:stallId", verifyJWT, complaintController.getComplaintsByStall);
app.put("/complaints/:complaintId/status", verifyJWT, validateComplaintStatus, complaintController.updateComplaintStatus);

// Routes for Submit Feedback for a Food Stall
app.post("/feedback", verifyJWT, validateFeedback, feedbackController.createFeedback);
app.put("/feedback/:id", verifyJWT, validateReviewId, validateFeedback, feedbackController.updateFeedback);
app.delete("/feedback/:id", verifyJWT, validateReviewId, feedbackController.deleteFeedback);

app.use((req, res) => {
    res.status(404).json({
        error: "API endpoint not found",
    });
});

app.use((error, req, res, next) => {
    console.error("Unhandled application error:", error);

    return res.status(500).json({
        error: "An unexpected server error occurred",
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
    console.log("Server is gracefully shutting down");
    await sql.close();
    console.log("Database connections closed");
    process.exit(0);
});