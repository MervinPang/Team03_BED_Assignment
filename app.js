const express = require("express");
const sql = require("mssql");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config();

const stallController = require("./controllers/stallController");
const orderController = require("./controllers/orderController");
const orderHistoryController = require("./controllers/orderHistoryController");
const paymentController = require("./controllers/paymentController");
const userController = require("./controllers/userController");
const inspectionController = require("./controllers/inspectionController");
const complaintController = require("./controllers/complaintController");

const { validateOrder, validateOrderStatus, validateOrderId, validateGuestOrderCancellation } = require("./middlewares/orderValidation"); // Import Order Validation Middleware

const { validateOrderHistoryId, validateGuestOrderHistory } = require("./middlewares/orderHistoryValidation"); // Import Order History Validation Middlware

const { validatePayment, validateAccountAvailability, validatePaymentStatus, validatePaymentMethodUpdate, validatePaymentId, validateOrderIdParam } = require("./middlewares/paymentValidation"); // Import Payment Validation Middleware

const { validateRegistration, validateLogin } = require("./middlewares/userValidation"); // Import User Validation Middleware

const { verifyJWT, optionalJWT } = require("./middlewares/authMiddleware"); // Import JWT Authorization Middleware

const { validateInspection } = require("./middlewares/inspectionValidation"); // Import Inspection Validation Middleware

const { validateComplaint, validateComplaintStatus } = require("./middlewares/complaintValidation");

const feedbackController = require("./controllers/feedbackController");

const { validateFeedback, validateReviewId, } = require("./middlewares/feedbackValidation"); // Import Feedback Validation Middleware

const analyticsController = require("./controllers/analyticsController");

const { validateStallOwnership } = require("./middlewares/analyticsValidation");

const vendorMenuController = require("./controllers/vendorMenuController");

const { validateMenuItem, validateAvailability, validateStallUpdate, requireStallOwnership, requireMenuItemInStall } = require("./middlewares/vendorMenuValidation"); // Import Vendor Menu Validation Middleware

const rentalController = require("./controllers/rentalController");

const { validateAgreement, validateRenewal, validateAgreementQuery, validateExpiryWindow, validateAgreementId } = require("./middlewares/rentalValidation"); // Import Rental Validation Middleware

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// Routes for Food Stalls and Menu Items
app.get("/stalls", stallController.getAllStalls);
app.get("/stalls/filter-options", stallController.getStallFilterOptions);
app.get("/stalls/:id", stallController.getStallById);
app.get("/stalls/:id/menu-items", stallController.getMenuItemsByStallId);
app.get("/vendors/me/stalls", verifyJWT, stallController.getMyVendorStalls);

// Routes for Vendor Menu and Stall Management
// Every route confirms that the signed in vendor owns the stall in the URL
app.get("/stalls/:stallId/manage/menu-items", verifyJWT, requireStallOwnership, vendorMenuController.getMenuItems);
app.post("/stalls/:stallId/menu-items", verifyJWT, requireStallOwnership, validateMenuItem, vendorMenuController.createMenuItem);
app.put("/stalls/:stallId/menu-items/:itemId", verifyJWT, requireStallOwnership, requireMenuItemInStall, validateMenuItem, vendorMenuController.updateMenuItem);
app.patch("/stalls/:stallId/menu-items/:itemId/availability", verifyJWT, requireStallOwnership, requireMenuItemInStall, validateAvailability, vendorMenuController.updateMenuItemAvailability);
app.delete("/stalls/:stallId/menu-items/:itemId", verifyJWT, requireStallOwnership, requireMenuItemInStall, vendorMenuController.deleteMenuItem);
app.put("/stalls/:stallId", verifyJWT, requireStallOwnership, validateStallUpdate, vendorMenuController.updateStall);

// Routes for Stall Rental Agreements
// The expiry report is registered before the agreement ID route
app.get("/rental-agreements", verifyJWT, validateAgreementQuery, rentalController.getAgreements);
app.get("/rental-agreements/expiring", verifyJWT, validateExpiryWindow, rentalController.getExpiringAgreements);
app.get("/rental-agreements/:id", verifyJWT, validateAgreementId, rentalController.getAgreementById);
app.post("/rental-agreements", verifyJWT, validateAgreement, rentalController.createAgreement);
app.put("/rental-agreements/:id/renew", verifyJWT, validateAgreementId, validateRenewal, rentalController.renewAgreement);

// Routes for Place Food Order
app.get("/orders", verifyJWT, orderController.getAllOrders);
app.get("/orders/:id", verifyJWT, validateOrderId, orderController.getOrderById);
app.post("/orders", optionalJWT, validateOrder, orderController.createOrder);
app.put("/orders/:id/status", verifyJWT, validateOrderId, validateOrderStatus, orderController.updateOrderStatus);
app.delete("/orders/:id", verifyJWT, validateOrderId, orderController.deleteOrder);
app.put("/orders/:id/guest-cancel", validateOrderId, validateGuestOrderCancellation, orderController.cancelGuestOrder);

// Routes for Order History
app.get("/order-history/active", verifyJWT, orderHistoryController.getActiveOrderHistory);
app.get("/order-history/previous", verifyJWT, orderHistoryController.getPreviousOrderHistory);
app.get("/order-history/most-frequent", verifyJWT, orderHistoryController.getMostFrequentOrders);
app.post("/order-history/guest", validateGuestOrderHistory, orderHistoryController.getGuestOrderHistory);
app.get("/order-history/:id", verifyJWT, validateOrderHistoryId, orderHistoryController.getOrderHistoryById);

// Routes for Checkout and Payment
app.get("/payments", verifyJWT, paymentController.getAllPayments);
app.get("/payments/:id", verifyJWT, validatePaymentId, paymentController.getPaymentById);
app.get("/payments/order/:orderId", verifyJWT, validateOrderIdParam, paymentController.getPaymentByOrderId);
app.post("/payments/check-account-availability", validateAccountAvailability, paymentController.checkAccountAvailability);
app.post("/payments", optionalJWT, validatePayment, paymentController.createPayment);
app.put("/payments/:id/status", verifyJWT, validatePaymentId, validatePaymentStatus, paymentController.updatePaymentStatus);
app.put("/payments/:id/method", optionalJWT, validatePaymentId, validatePaymentMethodUpdate, paymentController.updatePaymentMethod);
app.delete("/payments/:id", verifyJWT, validatePaymentId, paymentController.deletePayment);

// Routes for User Registration and Login
app.post("/register", validateRegistration, userController.registerUser);
app.post("/login", validateLogin, userController.loginUser);

// Routes for Inspections
app.post("/inspections", verifyJWT, validateInspection, inspectionController.submitInspection);
app.get("/inspections/:stallId", verifyJWT, inspectionController.getInspectionHistory);

//Routes for Complaints 
app.post("/complaints", verifyJWT, validateComplaint, complaintController.submitComplaint);
app.get("/complaints/:stallId", verifyJWT, complaintController.getComplaintsByStall);
app.put("/complaints/:complaintId/status", verifyJWT, validateComplaintStatus, complaintController.updateComplaintStatus);

// Routes for Submit Feedback for a Food Stall
app.post("/feedback", verifyJWT, validateFeedback, feedbackController.createFeedback);
app.put("/feedback/:id", verifyJWT, validateReviewId, validateFeedback, feedbackController.updateFeedback);
app.delete("/feedback/:id", verifyJWT, validateReviewId, feedbackController.deleteFeedback);
app.get("/feedback/stall/:stallId", feedbackController.getReviewsByStall);

// Routes for Vendor Sales Analytics 
app.get("/analytics/revenue/:stallId", verifyJWT, validateStallOwnership, analyticsController.getRevenueAnalytics);
app.get("/analytics/orders/:stallId", verifyJWT, validateStallOwnership, analyticsController.getOrderVolumeAnalytics);
app.get("/analytics/top-items/:stallId", verifyJWT, validateStallOwnership, analyticsController.getTopSellingItems);

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