const express = require("express");
const sql = require("mssql");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config();

const orderController = require("./controllers/orderController");
const paymentController = require("./controllers/paymentController");
const userController = require("./controllers/userController");

const {
  validateOrder,
  validateOrderStatus,
  validateOrderId,
} = require("./middlewares/orderValidation"); // Import Order Validation Middleware

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

const { verifyJWT } = require("./middlewares/authMiddleware"); // Import JWT Authorization Middleware

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
app.get(
  "/orders/:id",
  verifyJWT,
  validateOrderId,
  orderController.getOrderById,
);
app.post("/orders", verifyJWT, validateOrder, orderController.createOrder);
app.put(
  "/orders/:id/status",
  verifyJWT,
  validateOrderId,
  validateOrderStatus,
  orderController.updateOrderStatus,
);
app.delete(
  "/orders/:id",
  verifyJWT,
  validateOrderId,
  orderController.deleteOrder,
);

// Routes for Checkout and Payment
app.get("/payments", verifyJWT, paymentController.getAllPayments);
app.get(
  "/payments/:id",
  verifyJWT,
  validatePaymentId,
  paymentController.getPaymentById,
);
app.get(
  "/payments/order/:orderId",
  verifyJWT,
  validateOrderIdParam,
  paymentController.getPaymentByOrderId,
);
app.post(
  "/payments",
  verifyJWT,
  validatePayment,
  paymentController.createPayment,
);
app.put(
  "/payments/:id/status",
  verifyJWT,
  validatePaymentId,
  validatePaymentStatus,
  paymentController.updatePaymentStatus,
);
app.delete(
  "/payments/:id",
  verifyJWT,
  validatePaymentId,
  paymentController.deletePayment,
);

// Routes for User Registration and Login
app.post("/register", validateRegistration, userController.registerUser);
app.post("/login", validateLogin, userController.loginUser);

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
