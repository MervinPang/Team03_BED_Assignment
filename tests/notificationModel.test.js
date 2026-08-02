// notificationModel.test.js
// Unit tests for the notification inbox model

const Notification = require("../models/notificationModel");
const sql = require("mssql");

jest.mock("mssql"); // Mock the mssql library

function mockConnection() {
    /*
     * mssql exposes its types two ways: sql.Int is handed over as it is, while
     * sql.VarChar(50) is called first. The automock returns undefined from a
     * call, so the ones that are called are given a value here for the
     * assertions on request.input() to match against.
     */
    sql.VarChar.mockReturnValue("VarChar");
    sql.Char.mockReturnValue("Char");
    sql.Decimal.mockReturnValue("Decimal");

    const mockRequest = {
        input: jest.fn(),
        query: jest.fn(),
    };

    const connection = {
        request: jest.fn().mockReturnValue(mockRequest),
        close: jest.fn().mockResolvedValue(undefined),
    };

    sql.connect.mockResolvedValue(connection); // Return the mock connection

    return { connection, mockRequest };
}

describe("notificationModel.getNotifications", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the inbox of one recipient", async () => {
        const mockNotifications = [
            { NotificationID: 2, Title: "Tenancy offer", IsRead: false },
            { NotificationID: 1, Title: "New order", IsRead: true },
        ];

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockNotifications });

        const notifications = await Notification.getNotifications(10);

        expect(sql.connect).toHaveBeenCalledWith(expect.any(Object));
        expect(mockRequest.input).toHaveBeenCalledWith(
            "RecipientUserID",
            expect.anything(),
            10
        );
        // sql.connect() hands back the pool shared by the whole application, so
        // this model deliberately leaves it open for the requests still running
        expect(connection.close).not.toHaveBeenCalled();
        expect(notifications).toEqual(mockNotifications);
    });

    it("should send the unread only flag as a bit", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        await Notification.getNotifications(10, { unreadOnly: true });

        expect(mockRequest.input).toHaveBeenCalledWith("UnreadOnly", expect.anything(), 1);
    });

    it("should default the unread only flag to zero", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        await Notification.getNotifications(10);

        expect(mockRequest.input).toHaveBeenCalledWith("UnreadOnly", expect.anything(), 0);
    });

    it("should handle errors when retrieving the inbox", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Notification.getNotifications(10)).rejects.toThrow(errorMessage);
    });
});

describe("notificationModel.getUnreadCount", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the unread total", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [{ UnreadCount: 4 }] });

        const count = await Notification.getUnreadCount(10);

        expect(count).toBe(4);
    });

    it("should handle errors when counting unread notifications", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Notification.getUnreadCount(10)).rejects.toThrow(errorMessage);
    });
});

describe("notificationModel.createNotification", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should write the notification and return its new ID", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [{ NotificationID: 21 }] });

        const id = await Notification.createNotification({
            recipientUserId: 10,
            notificationType: "Agreement Offer",
            title: "Tenancy offer for Rayne's Rojak",
            message: "Sign the offer to take on the stall",
            offerId: 80,
        });

        expect(mockRequest.input).toHaveBeenCalledWith(
            "RecipientUserID",
            expect.anything(),
            10
        );
        expect(mockRequest.input).toHaveBeenCalledWith("OfferID", expect.anything(), 80);
        // A tenancy offer carries no order, so that column is left null
        expect(mockRequest.input).toHaveBeenCalledWith("OrderID", expect.anything(), null);
        expect(id).toBe(21);
    });

    it("should handle errors when writing the notification", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            Notification.createNotification({
                recipientUserId: 10,
                notificationType: "Agreement Offer",
                title: "Tenancy offer",
                message: "Sign the offer",
            })
        ).rejects.toThrow(errorMessage);
    });
});

describe("notificationModel.markAsRead", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the ID of the notification it marked", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [{ NotificationID: 21 }] });

        const id = await Notification.markAsRead(21, 10);

        expect(mockRequest.input).toHaveBeenCalledWith(
            "NotificationID",
            expect.anything(),
            21
        );
        expect(mockRequest.input).toHaveBeenCalledWith(
            "RecipientUserID",
            expect.anything(),
            10
        );
        expect(id).toBe(21);
    });

    it("should return null when the row belongs to another account", async () => {
        // The recipient is part of the WHERE clause, so it simply matches nothing
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const id = await Notification.markAsRead(21, 11);

        expect(id).toBeNull();
    });

    it("should handle errors when marking the notification", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Notification.markAsRead(21, 10)).rejects.toThrow(errorMessage);
    });
});

describe("notificationModel.markAllAsRead", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return how many rows it cleared", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ rowsAffected: [3] });

        const updated = await Notification.markAllAsRead(10);

        expect(updated).toBe(3);
    });

    it("should handle errors when clearing the inbox", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Notification.markAllAsRead(10)).rejects.toThrow(errorMessage);
    });
});
