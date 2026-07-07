const express = require("express");
const sql = require("mssql");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config();

const orderController = require("./controllers/orderController");

const {
    validateOrder,
    validateOrderStatus,
    validateOrderId,
} = require("./middlewares/orderValidation"); // Import Order Validation Middleware

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// Routes for Place Food Order
app.get("/orders", orderController.getAllOrders);
app.get("/orders/:id", validateOrderId, orderController.getOrderById);
app.post("/orders", validateOrder, orderController.createOrder);