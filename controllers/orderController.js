const orderModel = require("../models/orderModel");

// Get all orders
async function getAllOrders(req, res) {
    try {
        const orders = await orderModel.getAllOrders();
        res.json(orders);
    } catch (error) {
        console.error("Controller error (getAllOrders):", error);
        res.status(500).json({ error: "Error retrieving orders" });
    }
}

// Get order by ID
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

// Create new order
async function createOrder(req, res) {
    try {
        const newOrder = await orderModel.createOrder(req.body);
        res.status(201).json(newOrder);

    } catch (error) {
        console.error("Controller error (createOrder):", error);
        res.status(500).json({
            error: "Error creating order",
        });
    }
}

// Update order status
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
            error: "Failed to update order",
        });
    }
}

// Delete order
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