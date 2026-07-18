const orderHistoryModel = require("../models/orderHistoryModel");

// Retrieve all active orders belonging to the authenticated customer
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

// Retrieves completed and cancelled orders for the authenticated customer
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

// Retrieves the complete details of a customer's order, including ordered items and status history
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
        console.error("Controller error (getOrderHistoryById):", error);

        return res.status(500).json({
            error: "Error retrieving order history details",
        });
    }
}

// Retrieves a guest order using the Order ID and
// Guest Order Reference generated during checkout
async function getGuestOrderHistory(req, res) {
    try {
        const order =
            await orderHistoryModel.getGuestOrderHistory(req.body.OrderID, req.body.GuestOrderReference);

        if (!order) {
            return res.status(404).json({ error:"Guest order not found or the reference is invalid" });
        }

        return res.status(200).json(order);
    } catch (error) {
        console.error("Controller error (getGuestOrderHistory):", error);

        return res.status(500).json({ error: "Error retrieving guest order history" });
    }
}

module.exports = {
    getActiveOrderHistory,
    getPreviousOrderHistory,
    getOrderHistoryById,
    getGuestOrderHistory,
};