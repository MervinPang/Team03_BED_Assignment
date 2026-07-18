const orderHistoryModel = require("../models/orderHistoryModel");

// Retrieve active orders for a registered customer
async function getActiveOrderHistory(req, res) {
    try {
        const orders =
            await orderHistoryModel.getActiveOrderHistory(req.user.id);
            return res.status(200).json(orders);
    } catch (error) {
        console.error("Controller error (getActiveOrderHistory):", error);
        return res.status(500).json({ error: "Error retrieving active orders" });
    }
}

// Retrieve previous orders for a registered customer
async function getPreviousOrderHistory(req, res) {
    try {
        const orders =
            await orderHistoryModel.getPreviousOrderHistory(req.user.id);
            return res.status(200).json(orders);
    } catch (error) {
        console.error("Controller error (getPreviousOrderHistory):", error);
        return res.status(500).json({ error: "Error retrieving previous orders" });
    }
}

// Retrieve full details for one registered customer's order
async function getOrderHistoryById(req, res) {
    try {
        const orderId = Number(req.params.id);
        const orderHistory =
            await orderHistoryModel.getOrderHistoryById(orderId, req.user.id);

        if (!orderHistory) {
            return res.status(404).json({ error:"Order not found or you do not have access to this order" });
        }

        return res.status(200).json(orderHistory);
    } catch (error) {
        console.error("Controller error (getGuestOrderHistory):", error);

        return res.status(500).json({
            error: "Error retrieving guest order details",
        });
    }
}

// Retrieve one guest order using its saved reference
async function getGuestOrderHistory(req, res) {
    try {
        const order =
            await orderHistoryModel.getGuestOrderHistory(req.body.OrderID, req.body.GuestOrderReference);

        if (!order) {
            return res.status(404).json({ error:"Guest order not found or the reference is invalid" });
        }

        return res.status(200).json(order);
    } catch (error) {
        console.error("Controller error (getOrderHistoryById):", error);

        return res.status(500).json({ error: "Error retrieving guest order history" });
    }
}

module.exports = {
    getActiveOrderHistory,
    getPreviousOrderHistory,
    getOrderHistoryById,
    getGuestOrderHistory,
};