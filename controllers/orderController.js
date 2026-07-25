const orderModel = require("../models/orderModel");

// Order Controller - Handles HTTP requests for Place Food Order

// Retrieve all customer orders
async function getAllOrders(req, res) {
    try {
        const orders = await orderModel.getAllOrders(req.user);
        return res.status(200).json(orders);
    } catch (error) {
        console.error("Controller error (getAllOrders):", error);
        return res.status(500).json({ error: "Error retrieving orders" });
    }
}

// Retrieve a customer order by its ID
async function getOrderById(req, res) {
    try {
        const id = parseInt(req.params.id);

        const order = await orderModel.getOrderById(id, req.user);

        if (!order) {
            return res.status(404).json({
                error: "Order not found",
            });
        }

        return res.status(200).json(order);

    } catch (error) {
        console.error("Controller error (getOrderById):", error);
        return res.status(500).json({
            error: "Error retrieving order",
        });
    }
}

// Creates a new member or guest order by delegating
// business logic to the model layer and translating
// business exceptions into appropriate HTTP responses
async function createOrder(req, res) {
    try {
        const newOrder = await orderModel.createOrder(req.body, req.user);
        return res.status(201).json(newOrder);

    } catch (error) {
        console.error("Controller error (createOrder):", error);

        if (
            error.message.includes("does not exist") ||
            error.message.includes("is not available") ||
            error.message.includes("Invalid price configured") ||
            error.message === "All items in an order must come from the same food stall" ||
            error.message === "The selected food stall is currently unavailable"
        ) {
            return res.status(400).json({
                error: error.message,
            });
        }
        if (
            error.message === "Authentication is required for member orders"
        ) {
            return res.status(401).json({
                error: error.message,
            });
        }

        if (
            error.message === "Only customers can create member orders" ||
            error.message === "Logged-in users must create member orders"
        ) {
            return res.status(403).json({
                error: error.message,
            });
        }

        return res.status(500).json({
            error: "Error creating order",
        });
    }
}

// Update the lifecycle status of an order
// Business rules such as valid status transitions,
// vendor ownership and timeline recording are
// enforced by the model layer
async function updateOrderStatus(req, res) {
    try {
        const id = parseInt(req.params.id);

        const updatedOrder = await orderModel.updateOrderStatus(id, req.body.OrderStatus, req.user);

        if (!updatedOrder) {
            return res.status(404).json({
                error: "Order not found or not assigned to this vendor",
            });
        }
        return res.status(200).json(updatedOrder);

    } catch (error) {
        console.error("Controller error (updateOrderStatus):", error);

        if (error.message === "You are not authorised to update this order") {
            return res.status(403).json({
                error: error.message,
            });
        }

        if (error.message.startsWith("Order status cannot be changed")) {
            return res.status(409).json({
                error: error.message,
            });
        }

        return res.status(500).json({
            error: "Failed to update order status",
        });
    }
}

// Cancel a pending customer order
// The model validates ownership,
// payment status and transactional integrity
// before preserving the order with a Cancelled status
async function deleteOrder(req, res) {
    try {
        const id = parseInt(req.params.id);

        const deleted = await orderModel.deleteOrder(id, req.user);

        if (!deleted) {
            return res.status(404).json({
                error: "Order not found",
            });
        }
        return res.status(204).send();

    } catch (error) {
        console.error("Controller error (deleteOrder):", error);

        // Handle business rule errors
        if (
            error.message === "Only pending orders can be cancelled" ||
            error.message === "Paid orders cannot be cancelled"
        ) {
            return res.status(409).json({
                error: error.message,
            });
        }

        // Handle unexpected server errors
        return res.status(500).json({
            error: "Failed to delete order",
        });

    }
}

// Cancel a pending guest order
// The guest order reference acts as proof that the
// requester has access to the selected guest order
async function cancelGuestOrder(req, res) {
    try {
        const id = parseInt(req.params.id);

        const cancelledOrder = await orderModel.cancelGuestOrder(id, req.body.GuestOrderReference);

        if (!cancelledOrder) {
            return res.status(404).json({
                error:
                    "Guest order not found or guest order reference is incorrect",
            });
        }

        return res.status(200).json({
            message:
                "Guest order cancelled successfully",
            order: cancelledOrder,
        });
    } catch (error) {
        console.error(
            "Controller error (cancelGuestOrder):",
            error
        );

        if (error.message === "Only pending guest orders can be cancelled") {
            return res.status(409).json({
                error: error.message,
            });
        }

        if (
            error.message === "Paid orders cannot be cancelled") {
            return res.status(409).json({
                error: error.message,
            });
        }

        return res.status(500).json({
            error:
                "Failed to cancel guest order",
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
    cancelGuestOrder,
};