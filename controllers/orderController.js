const orderModel = require("../models/orderModel");

// Order Controller - Handles HTTP requests for Place Food Order

// Retrieve all customer orders
async function getAllOrders(req, res) {
    try {
        const orders = await orderModel.getAllOrders();
        res.json(orders);
    } catch (error) {
        console.error("Controller error (getAllOrders):", error);
        res.status(500).json({ error: "Error retrieving orders" });
    }
}

// Retrieve a customer order by its ID
async function getOrderById(req, res) {
    try {
        const id = parseInt(req.params.id);

        const order = await orderModel.getOrderById(id);

        if (!order) {
            return res.status(404).json({
                error: "Order not found",
            });
        }

        res.json(order);

    } catch (error) {
        console.error("Controller error (getOrderById):", error);
        res.status(500).json({
            error: "Error retrieving order",
        });
    }
}

// Create a new customer order
async function createOrder(req, res) {
    try {
        const newOrder = await orderModel.createOrder(req.body);
        res.status(201).json(newOrder);

    } catch (error) {
        console.error("Controller error (createOrder):", error);

        if (
            error.message.includes("does not exist") ||
            error.message.includes("is not available")
        ) {
            return res.status(400).json({
                error: error.message,
            });
        }

        res.status(500).json({
            error: "Error creating order",
        });
    }
}

// Update an existing order status
async function updateOrderStatus(req, res) {
    try {
        const id = parseInt(req.params.id);

        const updatedOrder = await orderModel.updateOrderStatus(id, req.body.OrderStatus);

        if (!updatedOrder) {
            return res.status(404).json({
                error: "Order not found",
            });
        }
        res.json(updatedOrder);

    } catch (error) {
        console.error("Controller error (updateOrderStatus):", error);
        res.status(500).json({
            error: "Failed to update order status",
        });
    }
}

// Delete a customer order
async function deleteOrder(req, res) {
    try {
        const id = parseInt(req.params.id);

        const deleted = await orderModel.deleteOrder(id);

        if (!deleted) {
            return res.status(404).json({
                error: "Order not found",
            });
        }
        res.status(204).send();

    } catch (error) {
        console.error("Controller error (deleteOrder):", error);
        res.status(500).json({
            error: "Failed to delete order",
        });

    }
}

// Export controller functions for use in order routes
module.exports = {
    createOrder,
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    deleteOrder,
};