// inspectionController.test.js
// Unit tests for the NEA officer Inspection controller
//
// This controller queries the database itself instead of going through a model,
// so the mssql library is mocked here in the same way a model test mocks it.

const inspectionController = require("../controllers/inspectionController");
const sql = require("mssql");

jest.mock("mssql"); // Mock the mssql library

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

// Read back the value the controller bound to a named query parameter
function inputValue(request, name) {
    const call = request.input.mock.calls.find(args => args[0] === name);

    return call ? call[2] : undefined;
}

describe("inspectionController.submitInspection", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should file an inspection and return a 201 status", async () => {
        const { request } = mockPool();

        const newInspection = {
            InspectionID: 11,
            OfficerUserID: 4,
            StallID: 3,
            HygieneGrade: "A",
        };

        request.query
            .mockResolvedValueOnce({ recordset: [{ StallID: 3 }] }) // stall exists
            .mockResolvedValueOnce({ recordset: [newInspection] });

        const req = {
            body: { stall_id: 3, score: 90 },
            user: { id: 4, role: "nea_officer" },
        };
        const res = mockResponse();

        await inspectionController.submitInspection(req, res);

        // A score of 90 earns an A
        expect(inputValue(request, "HygieneGrade")).toBe("A");
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ ...newInspection, Remark: null });
    });

    it("should store the remark alongside the inspection", async () => {
        const { request } = mockPool();

        const newInspection = { InspectionID: 12, StallID: 3, HygieneGrade: "B" };

        request.query
            .mockResolvedValueOnce({ recordset: [{ StallID: 3 }] })
            .mockResolvedValueOnce({ recordset: [newInspection] })
            .mockResolvedValueOnce({
                recordset: [{ RemarkText: "Clean the drains" }],
            });

        const req = {
            body: { stall_id: 3, score: 75, remarks: "Clean the drains" },
            user: { id: 4, role: "nea_officer" },
        };
        const res = mockResponse();

        await inspectionController.submitInspection(req, res);

        // A score of 75 earns a B
        expect(inputValue(request, "HygieneGrade")).toBe("B");
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            ...newInspection,
            Remark: "Clean the drains",
        });
    });

    it("should derive a D for a failing score", async () => {
        const { request } = mockPool();

        request.query
            .mockResolvedValueOnce({ recordset: [{ StallID: 3 }] })
            .mockResolvedValueOnce({
                recordset: [{ InspectionID: 13, StallID: 3, HygieneGrade: "D" }],
            });

        const req = {
            body: { stall_id: 3, score: 20 },
            user: { id: 4, role: "nea_officer" },
        };
        const res = mockResponse();

        await inspectionController.submitInspection(req, res);

        expect(inputValue(request, "HygieneGrade")).toBe("D");
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return a 400 status when the stall does not exist", async () => {
        const { request } = mockPool();

        request.query.mockResolvedValueOnce({ recordset: [] });

        const req = {
            body: { stall_id: 999, score: 90 },
            user: { id: 4, role: "nea_officer" },
        };
        const res = mockResponse();

        await inspectionController.submitInspection(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Stall does not exist." });
        // Nothing is written once the stall check fails
        expect(request.query).toHaveBeenCalledTimes(1);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        sql.connect.mockRejectedValue(new Error("Database error"));

        const req = {
            body: { stall_id: 3, score: 90 },
            user: { id: 4, role: "nea_officer" },
        };
        const res = mockResponse();

        await inspectionController.submitInspection(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Server error while submitting inspection report.",
        });
    });
});

describe("inspectionController.getInspectionHistory", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the inspection history of a stall", async () => {
        const { request } = mockPool();

        const history = [
            { InspectionID: 12, HygieneGrade: "B", RemarkText: "Clean the drains" },
            { InspectionID: 11, HygieneGrade: "A", RemarkText: null },
        ];

        request.query.mockResolvedValue({ recordset: history });

        const req = { params: { stallId: "3" }, user: { id: 4 } };
        const res = mockResponse();

        await inspectionController.getInspectionHistory(req, res);

        expect(inputValue(request, "StallID")).toBe("3");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(history);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        sql.connect.mockRejectedValue(new Error("Database error"));

        const req = { params: { stallId: "3" }, user: { id: 4 } };
        const res = mockResponse();

        await inspectionController.getInspectionHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Server error while retrieving inspection history.",
        });
    });
});
