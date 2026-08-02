// complaintController.test.js
// Unit tests for the Complaint controller
//
// This controller queries the database itself for the complaint and uses the
// Rental model only to find out which operator the signed in account works for,
// so both mssql and the Rental model are mocked here.

const complaintController = require("../controllers/complaintController");
const rentalModel = require("../models/rentalModel");
const sql = require("mssql");

jest.mock("mssql"); // Mock the mssql library
jest.mock("../models/rentalModel");

function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

// The controller chains .input().input().query(), so input has to return itself
function mockPool() {
    const request = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn(),
    };

    const pool = {
        request: jest.fn().mockReturnValue(request),
    };

    sql.connect.mockResolvedValue(pool);

    return { pool, request };
}

describe("complaintController.submitComplaint", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should file a complaint and return a 201 status", async () => {
        const { request } = mockPool();

        const newComplaint = {
            ComplaintID: 5,
            UserID: 5,
            StallID: 3,
            ComplaintTitle: "Dirty tray",
            ComplaintStatus: "Open",
        };

        request.query
            .mockResolvedValueOnce({ recordset: [{ StallID: 3 }] }) // stall exists
            .mockResolvedValueOnce({ recordset: [newComplaint] });

        const req = {
            body: {
                stall_id: 3,
                complaint_title: "Dirty tray",
                complaint_desc: "The tray was not cleaned",
            },
            user: { id: 5, role: "customer" },
        };
        const res = mockResponse();

        await complaintController.submitComplaint(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(newComplaint);
    });

    it("should return a 400 status when the stall does not exist", async () => {
        const { request } = mockPool();

        request.query.mockResolvedValueOnce({ recordset: [] });

        const req = {
            body: { stall_id: 999, complaint_title: "x", complaint_desc: "y" },
            user: { id: 5, role: "customer" },
        };
        const res = mockResponse();

        await complaintController.submitComplaint(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Stall does not exist." });
        // Nothing is written once the stall check fails
        expect(request.query).toHaveBeenCalledTimes(1);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        sql.connect.mockRejectedValue(new Error("Database error"));

        const req = {
            body: { stall_id: 3, complaint_title: "x", complaint_desc: "y" },
            user: { id: 5, role: "customer" },
        };
        const res = mockResponse();

        await complaintController.submitComplaint(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Server error while submitting complaint.",
        });
    });
});

describe("complaintController.getComplaintsByStall", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the complaints filed against a stall", async () => {
        const { request } = mockPool();

        const complaints = [
            { ComplaintID: 5, ComplaintStatus: "Open" },
            { ComplaintID: 4, ComplaintStatus: "Resolved" },
        ];

        request.query.mockResolvedValue({ recordset: complaints });

        const req = { params: { stallId: "3" }, user: { id: 5 } };
        const res = mockResponse();

        await complaintController.getComplaintsByStall(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(complaints);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        sql.connect.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3" }, user: { id: 5 } };
        const res = mockResponse();

        await complaintController.getComplaintsByStall(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Server error while retrieving complaints.",
        });
    });
});

describe("complaintController.updateComplaintStatus", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should let the operator of the centre resolve the complaint", async () => {
        const { request } = mockPool();

        const resolved = { ComplaintID: 5, ComplaintStatus: "Resolved" };

        request.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        ComplaintID: 5,
                        StallName: "Rayne's Rojak",
                        HCName: "Bedok Hawker Centre",
                        OperatorID: 1,
                    },
                ],
            })
            .mockResolvedValueOnce({ recordset: [resolved] });

        // The operator is read from the database, never from the token
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });

        const req = {
            params: { complaintId: "5" },
            body: { status: "Resolved" },
            user: { id: 2, role: "operator" },
        };
        const res = mockResponse();

        await complaintController.updateComplaintStatus(req, res);

        expect(rentalModel.getOperatorIdForUser).toHaveBeenCalledWith(2);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(resolved);
    });

    it("should return a 400 status when the complaint does not exist", async () => {
        const { request } = mockPool();

        request.query.mockResolvedValueOnce({ recordset: [] });

        const req = {
            params: { complaintId: "999" },
            body: { status: "Resolved" },
            user: { id: 2, role: "operator" },
        };
        const res = mockResponse();

        await complaintController.updateComplaintStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Complaint does not exist." });
        expect(rentalModel.getOperatorIdForUser).not.toHaveBeenCalled();
    });

    it("should return a 403 status when the account is linked to no operator", async () => {
        const { request } = mockPool();

        request.query.mockResolvedValueOnce({
            recordset: [
                {
                    ComplaintID: 5,
                    StallName: "Rayne's Rojak",
                    HCName: "Bedok Hawker Centre",
                    OperatorID: 1,
                },
            ],
        });

        rentalModel.getOperatorIdForUser.mockResolvedValue(null);

        const req = {
            params: { complaintId: "5" },
            body: { status: "Resolved" },
            user: { id: 9, role: "operator" },
        };
        const res = mockResponse();

        await complaintController.updateComplaintStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "Your account is not linked to a hawker centre operator.",
        });
    });

    it("should return a 403 status when the stall is run by another operator", async () => {
        const { request } = mockPool();

        request.query.mockResolvedValueOnce({
            recordset: [
                {
                    ComplaintID: 5,
                    StallName: "Rayne's Rojak",
                    HCName: "Bedok Hawker Centre",
                    OperatorID: 1,
                },
            ],
        });

        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 2 });

        const req = {
            params: { complaintId: "5" },
            body: { status: "Resolved" },
            user: { id: 3, role: "operator" },
        };
        const res = mockResponse();

        await complaintController.updateComplaintStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error:
                "Rayne's Rojak is in Bedok Hawker Centre, which is run by another operator.",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        sql.connect.mockRejectedValue(new Error("Database error"));

        const req = {
            params: { complaintId: "5" },
            body: { status: "Resolved" },
            user: { id: 2, role: "operator" },
        };
        const res = mockResponse();

        await complaintController.updateComplaintStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Server error while updating complaint status.",
        });
    });
});
