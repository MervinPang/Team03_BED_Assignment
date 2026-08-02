// notificationController.test.js
// Unit tests for the notification inbox controller

const notificationController = require("../controllers/notificationController");
const notificationModel = require("../models/notificationModel");

// Mock the Notification model
jest.mock("../models/notificationModel");

function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

describe("notificationController.getMyNotifications", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the inbox with a total and an unread count", async () => {
        const mockNotifications = [
            { NotificationID: 1, Title: "New order", IsRead: false },
            { NotificationID: 2, Title: "Tenancy offer", IsRead: true },
            { NotificationID: 3, Title: "Offer signed", IsRead: false },
        ];

        notificationModel.getNotifications.mockResolvedValue(mockNotifications);

        const req = { user: { id: 10 }, unreadOnly: false };
        const res = mockResponse();

        await notificationController.getMyNotifications(req, res);

        // The recipient always comes from the token
        expect(notificationModel.getNotifications).toHaveBeenCalledWith(10, {
            unreadOnly: false,
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            notificationCount: 3,
            unreadCount: 2,
            notifications: mockNotifications,
        });
    });

    it("should pass the unread only flag through to the model", async () => {
        notificationModel.getNotifications.mockResolvedValue([]);

        const req = { user: { id: 10 }, unreadOnly: true };
        const res = mockResponse();

        await notificationController.getMyNotifications(req, res);

        expect(notificationModel.getNotifications).toHaveBeenCalledWith(10, {
            unreadOnly: true,
        });
        expect(res.json).toHaveBeenCalledWith({
            notificationCount: 0,
            unreadCount: 0,
            notifications: [],
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        notificationModel.getNotifications.mockRejectedValue(new Error("Database error"));

        const req = { user: { id: 10 }, unreadOnly: false };
        const res = mockResponse();

        await notificationController.getMyNotifications(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve your notifications",
        });
    });
});

describe("notificationController.getMyUnreadCount", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the unread total on its own", async () => {
        notificationModel.getUnreadCount.mockResolvedValue(4);

        const req = { user: { id: 10 } };
        const res = mockResponse();

        await notificationController.getMyUnreadCount(req, res);

        expect(notificationModel.getUnreadCount).toHaveBeenCalledWith(10);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ unreadCount: 4 });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        notificationModel.getUnreadCount.mockRejectedValue(new Error("Database error"));

        const req = { user: { id: 10 } };
        const res = mockResponse();

        await notificationController.getMyUnreadCount(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve your unread notifications",
        });
    });
});

describe("notificationController.markNotificationRead", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should mark one notification as read", async () => {
        notificationModel.markAsRead.mockResolvedValue(5);

        const req = { params: { notificationId: "5" }, user: { id: 10 } };
        const res = mockResponse();

        await notificationController.markNotificationRead(req, res);

        expect(notificationModel.markAsRead).toHaveBeenCalledWith(5, 10);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Notification marked as read",
            notificationId: 5,
        });
    });

    it("should return a 404 status when the notification belongs to somebody else", async () => {
        // A row belonging to another account simply matches nothing
        notificationModel.markAsRead.mockResolvedValue(null);

        const req = { params: { notificationId: "5" }, user: { id: 11 } };
        const res = mockResponse();

        await notificationController.markNotificationRead(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: "Notification not found, or it was already read",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        notificationModel.markAsRead.mockRejectedValue(new Error("Database error"));

        const req = { params: { notificationId: "5" }, user: { id: 10 } };
        const res = mockResponse();

        await notificationController.markNotificationRead(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to mark the notification as read",
        });
    });
});

describe("notificationController.markAllNotificationsRead", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should report the plural message when several were cleared", async () => {
        notificationModel.markAllAsRead.mockResolvedValue(3);

        const req = { user: { id: 10 } };
        const res = mockResponse();

        await notificationController.markAllNotificationsRead(req, res);

        expect(notificationModel.markAllAsRead).toHaveBeenCalledWith(10);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "3 notifications marked as read",
            updated: 3,
        });
    });

    it("should report the singular message when exactly one was cleared", async () => {
        notificationModel.markAllAsRead.mockResolvedValue(1);

        const req = { user: { id: 10 } };
        const res = mockResponse();

        await notificationController.markAllNotificationsRead(req, res);

        expect(res.json).toHaveBeenCalledWith({
            message: "1 notification marked as read",
            updated: 1,
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        notificationModel.markAllAsRead.mockRejectedValue(new Error("Database error"));

        const req = { user: { id: 10 } };
        const res = mockResponse();

        await notificationController.markAllNotificationsRead(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to mark your notifications as read",
        });
    });
});
