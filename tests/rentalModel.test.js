// rentalModel.test.js
// Unit tests for the Stall Rental Agreement and Tenancy Offer model

const Rental = require("../models/rentalModel");
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

// Signing an offer and ending a tenancy both write more than one row, so those
// paths run inside a transaction that has to be mocked too
function mockTransaction() {
    const transaction = {
        begin: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
    };

    const transactionRequest = {
        input: jest.fn(),
        query: jest.fn(),
    };

    sql.Transaction.mockImplementation(() => transaction);
    sql.Request.mockImplementation(() => transactionRequest);

    return { transaction, transactionRequest };
}

describe("rentalModel.getAgreements", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the agreements matching the given scope", async () => {
        const mockAgreements = [
            { AgreementID: 1, AgreementStatus: "Active" },
            { AgreementID: 2, AgreementStatus: "Upcoming" },
        ];

        const { connection, mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: mockAgreements });

        const agreements = await Rental.getAgreements({ vendorUserId: 7 });

        expect(sql.connect).toHaveBeenCalledWith(expect.any(Object));
        expect(mockRequest.input).toHaveBeenCalledWith(
            "VendorUserID",
            expect.anything(),
            7
        );
        // The pool is shared by the whole application and is left open here
        expect(connection.close).not.toHaveBeenCalled();
        expect(agreements).toHaveLength(2);
    });

    it("should send null for a scope that was not given", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        await Rental.getAgreements({ operatorId: 1 });

        expect(mockRequest.input).toHaveBeenCalledWith(
            "VendorUserID",
            expect.anything(),
            null
        );
        expect(mockRequest.input).toHaveBeenCalledWith("OperatorID", expect.anything(), 1);
        expect(mockRequest.input).toHaveBeenCalledWith("Status", expect.anything(), null);
    });

    it("should handle errors when retrieving the agreements", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.getAgreements({ vendorUserId: 7 })).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.getAgreementById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve one agreement by its ID", async () => {
        const mockAgreement = { AgreementID: 50, StallID: 3, VendorUserID: 7 };

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [mockAgreement] });

        const agreement = await Rental.getAgreementById(50);

        expect(mockRequest.input).toHaveBeenCalledWith(
            "AgreementID",
            expect.anything(),
            50
        );
        expect(agreement).toEqual(mockAgreement);
    });

    it("should return null when the agreement does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const agreement = await Rental.getAgreementById(999);

        expect(agreement).toBeNull();
    });

    it("should handle errors when reading the agreement", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.getAgreementById(50)).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.getExpiringAgreements", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the agreements expiring inside the window", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({
            recordset: [{ AgreementID: 50, DaysRemaining: 12 }],
        });

        const agreements = await Rental.getExpiringAgreements(30, 1);

        expect(mockRequest.input).toHaveBeenCalledWith("Days", expect.anything(), 30);
        expect(mockRequest.input).toHaveBeenCalledWith("OperatorID", expect.anything(), 1);
        expect(agreements).toHaveLength(1);
    });

    it("should handle errors when retrieving the expiry report", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.getExpiringAgreements(30, 1)).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.findOverlappingAgreement", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the agreement that clashes with the requested period", async () => {
        const clash = { AgreementID: 9, VendorName: "someoneelse" };

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [clash] });

        const overlapping = await Rental.findOverlappingAgreement(
            3,
            "2026-09-01",
            "2027-08-31"
        );

        expect(mockRequest.input).toHaveBeenCalledWith("StallID", expect.anything(), 3);
        expect(overlapping).toEqual(clash);
    });

    it("should return null when the period is free", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const overlapping = await Rental.findOverlappingAgreement(
            3,
            "2026-09-01",
            "2027-08-31"
        );

        expect(overlapping).toBeNull();
    });

    it("should exclude the agreement being renewed from the clash check", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        await Rental.findOverlappingAgreement(3, "2026-01-01", "2027-12-31", 50);

        expect(mockRequest.input).toHaveBeenCalledWith(
            "ExcludeAgreementID",
            expect.anything(),
            50
        );
    });

    it("should handle errors when checking for a clash", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            Rental.findOverlappingAgreement(3, "2026-09-01", "2027-08-31")
        ).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.getStallById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should read the stall together with the operator of its hawker centre", async () => {
        const stall = {
            StallID: 3,
            StallName: "Rayne's Rojak",
            HCName: "Bedok Hawker Centre",
            OperatorID: 1,
        };

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [stall] });

        const result = await Rental.getStallById(3);

        expect(result).toEqual(stall);
    });

    it("should return null when the stall does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const result = await Rental.getStallById(999);

        expect(result).toBeNull();
    });

    it("should handle errors when reading the stall", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.getStallById(3)).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.getVendorById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should read the account named on an agreement with its role", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({
            recordset: [{ UserID: 7, Username: "louisvendor", Role: "vendor" }],
        });

        const vendor = await Rental.getVendorById(7);

        expect(vendor.Role).toBe("vendor");
    });

    it("should return null when the account does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const vendor = await Rental.getVendorById(999);

        expect(vendor).toBeNull();
    });

    it("should handle errors when reading the account", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.getVendorById(7)).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.getVendorAccounts", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should list every vendor account with how many stalls they already hold", async () => {
        const vendors = [
            { UserID: 7, Username: "louisvendor", StallCount: 1 },
            { UserID: 10, Username: "abgmodz", StallCount: 0 },
        ];

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: vendors });

        const result = await Rental.getVendorAccounts();

        expect(result).toEqual(vendors);
    });

    it("should handle errors when listing the vendor accounts", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.getVendorAccounts()).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.getManagedStalls", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the stalls inside the operator's hawker centres", async () => {
        const stalls = [
            { StallID: 3, HasCurrentTenancy: 1, TenantName: "louisvendor" },
            { StallID: 4, HasCurrentTenancy: 0, TenantName: null },
        ];

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: stalls });

        const result = await Rental.getManagedStalls(1);

        expect(mockRequest.input).toHaveBeenCalledWith("OperatorID", expect.anything(), 1);
        expect(result).toHaveLength(2);
    });

    it("should handle errors when retrieving the stall register", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.getManagedStalls(1)).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.getManagedCentres", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the hawker centres with their let and total stall counts", async () => {
        const centres = [
            { HawkerCentreID: 1, HCName: "Bedok Hawker Centre", StallCount: 8, RentedCount: 5 },
        ];

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: centres });

        const result = await Rental.getManagedCentres(1);

        expect(result).toEqual(centres);
    });

    it("should handle errors when retrieving the hawker centres", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.getManagedCentres(1)).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.getOperatorIdForUser", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should read the operator behind an operator account", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({
            recordset: [{ OperatorID: 1, OperatorName: "Bedok Operator" }],
        });

        const operator = await Rental.getOperatorIdForUser(2);

        expect(mockRequest.input).toHaveBeenCalledWith("UserID", expect.anything(), 2);
        expect(operator.OperatorID).toBe(1);
    });

    it("should return null for an account that is not an operator", async () => {
        // The role is part of the WHERE clause, so a vendor matches nothing
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const operator = await Rental.getOperatorIdForUser(7);

        expect(operator).toBeNull();
    });

    it("should handle errors when reading the operator", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.getOperatorIdForUser(2)).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.createAgreement", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should write the agreement unsigned and return its new ID", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [{ AgreementID: 50 }] });

        const agreementId = await Rental.createAgreement({
            StallID: 3,
            VendorUserID: 7,
            StartDate: "2026-09-01",
            EndDate: "2027-08-31",
            RentalPrice: 1200,
            TermCondition: "Standard terms",
        });

        expect(mockRequest.input).toHaveBeenCalledWith("StallID", expect.anything(), 3);
        expect(mockRequest.input).toHaveBeenCalledWith(
            "VendorUserID",
            expect.anything(),
            7
        );
        // AcceptedOn is left out entirely, which is what keeps the stall vacant
        expect(mockRequest.query.mock.calls[0][0]).not.toContain("AcceptedOn");
        expect(agreementId).toBe(50);
    });

    it("should handle errors when writing the agreement", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            Rental.createAgreement({
                StallID: 3,
                VendorUserID: 7,
                StartDate: "2026-09-01",
                EndDate: "2027-08-31",
                RentalPrice: 1200,
            })
        ).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.createOffer", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should write the offer and return its new ID", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [{ OfferID: 80 }] });

        const offerId = await Rental.createOffer({
            agreementId: 50,
            offerType: "New Tenancy",
            offeredByUserId: 2,
            proposedEndDate: "2027-08-31",
            proposedRentalPrice: 1200,
            offerNote: "Standard terms",
        });

        expect(mockRequest.input).toHaveBeenCalledWith(
            "OfferType",
            expect.anything(),
            "New Tenancy"
        );
        expect(offerId).toBe(80);
    });

    it("should default to a renewal when no offer type is given", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [{ OfferID: 81 }] });

        await Rental.createOffer({
            agreementId: 50,
            offeredByUserId: 2,
            proposedEndDate: "2027-12-31",
            proposedRentalPrice: 1300,
        });

        expect(mockRequest.input).toHaveBeenCalledWith(
            "OfferType",
            expect.anything(),
            "Renewal"
        );
        expect(mockRequest.input).toHaveBeenCalledWith(
            "OfferNote",
            expect.anything(),
            null
        );
    });

    it("should handle errors when writing the offer", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(
            Rental.createOffer({
                agreementId: 50,
                offeredByUserId: 2,
                proposedEndDate: "2027-12-31",
                proposedRentalPrice: 1300,
            })
        ).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.getOfferById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should read one offer with the agreement and stall behind it", async () => {
        const offer = { OfferID: 80, AgreementID: 50, StallName: "Rayne's Rojak" };

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [offer] });

        const result = await Rental.getOfferById(80);

        expect(mockRequest.input).toHaveBeenCalledWith("OfferID", expect.anything(), 80);
        expect(result).toEqual(offer);
    });

    it("should return null when the offer does not exist", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const result = await Rental.getOfferById(999);

        expect(result).toBeNull();
    });

    it("should handle errors when reading the offer", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.getOfferById(80)).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.getOffers", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should retrieve the offers matching the given scope", async () => {
        const offers = [{ OfferID: 80, OfferStatus: "Pending Signature" }];

        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: offers });

        const result = await Rental.getOffers({
            vendorUserId: 7,
            status: "Pending Signature",
        });

        expect(mockRequest.input).toHaveBeenCalledWith(
            "VendorUserID",
            expect.anything(),
            7
        );
        expect(mockRequest.input).toHaveBeenCalledWith(
            "OfferStatus",
            expect.anything(),
            "Pending Signature"
        );
        expect(result).toEqual(offers);
    });

    it("should handle errors when retrieving the offers", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.getOffers({ vendorUserId: 7 })).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.findOpenOffer", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the offer still waiting on the agreement", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({
            recordset: [{ OfferID: 80, OfferStatus: "Pending Signature" }],
        });

        const offer = await Rental.findOpenOffer(50);

        expect(offer.OfferID).toBe(80);
    });

    it("should return null when nothing is waiting on the agreement", async () => {
        const { mockRequest } = mockConnection();
        mockRequest.query.mockResolvedValue({ recordset: [] });

        const offer = await Rental.findOpenOffer(50);

        expect(offer).toBeNull();
    });

    it("should handle errors when looking for an open offer", async () => {
        const errorMessage = "Database Error";

        sql.connect.mockRejectedValue(new Error(errorMessage));

        await expect(Rental.findOpenOffer(50)).rejects.toThrow(errorMessage);
    });
});

describe("rentalModel.signOffer", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should accept a new tenancy and hand the stall to the vendor", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        OfferID: 80,
                        AgreementID: 50,
                        OfferType: "New Tenancy",
                        ProposedEndDate: "2027-08-31",
                        ProposedRentalPrice: 1200,
                    },
                ],
            }) // the signature
            .mockResolvedValueOnce({
                recordset: [{ AgreementID: 50, StallID: 3, VendorUserID: 7 }],
            }) // AcceptedOn is filled in
            .mockResolvedValueOnce({ rowsAffected: [1] }); // the stall is assigned

        const agreementId = await Rental.signOffer(80, "louisvendor", "a".repeat(64));

        expect(transaction.begin).toHaveBeenCalledTimes(1);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(transaction.rollback).not.toHaveBeenCalled();
        expect(agreementId).toBe(50);
    });

    it("should move a signed renewal onto the new end date and rent", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        OfferID: 81,
                        AgreementID: 50,
                        OfferType: "Renewal",
                        ProposedEndDate: "2027-12-31",
                        ProposedRentalPrice: 1300,
                    },
                ],
            })
            .mockResolvedValueOnce({ rowsAffected: [1] });

        const agreementId = await Rental.signOffer(81, "louisvendor", "b".repeat(64));

        // A renewal never touches the stall assignment, only the agreement terms
        expect(transactionRequest.query).toHaveBeenCalledTimes(2);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(agreementId).toBe(50);
    });

    it("should return null when the offer was already answered", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        // The UPDATE is guarded on the offer still being pending
        transactionRequest.query.mockResolvedValueOnce({ recordset: [] });

        const agreementId = await Rental.signOffer(80, "louisvendor", "a".repeat(64));

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(agreementId).toBeNull();
    });

    it("should roll the signature back when the agreement cannot be accepted", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [
                    {
                        OfferID: 80,
                        AgreementID: 50,
                        OfferType: "New Tenancy",
                        ProposedEndDate: "2027-08-31",
                        ProposedRentalPrice: 1200,
                    },
                ],
            })
            .mockResolvedValueOnce({ recordset: [] }); // already accepted or cancelled

        const agreementId = await Rental.signOffer(80, "louisvendor", "a".repeat(64));

        // A stored signature that never took effect would misrepresent the vendor
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(agreementId).toBeNull();
    });

    it("should roll back and rethrow when the database fails", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockRejectedValue(new Error("Database Error"));

        await expect(
            Rental.signOffer(80, "louisvendor", "a".repeat(64))
        ).rejects.toThrow("Database Error");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });
});

describe("rentalModel.rejectOffer and withdrawOffer", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should cancel the agreement behind a rejected new tenancy", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [{ OfferID: 80, AgreementID: 50, OfferType: "New Tenancy" }],
            })
            .mockResolvedValueOnce({ rowsAffected: [1] }); // the agreement is cancelled

        const offerId = await Rental.rejectOffer(80, "Too expensive");

        expect(transactionRequest.query).toHaveBeenCalledTimes(2);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(offerId).toBe(80);
    });

    it("should leave the agreement alone when a renewal is rejected", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({
            recordset: [{ OfferID: 81, AgreementID: 50, OfferType: "Renewal" }],
        });

        const offerId = await Rental.rejectOffer(81, null);

        // The vendor stays on the terms both sides already agreed to
        expect(transactionRequest.query).toHaveBeenCalledTimes(1);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(offerId).toBe(81);
    });

    it("should return null when the offer was already answered", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({ recordset: [] });

        const offerId = await Rental.withdrawOffer(80);

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(offerId).toBeNull();
    });

    it("should withdraw an unanswered offer", async () => {
        mockConnection();
        const { transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({
                recordset: [{ OfferID: 80, AgreementID: 50, OfferType: "New Tenancy" }],
            })
            .mockResolvedValueOnce({ rowsAffected: [1] });

        const offerId = await Rental.withdrawOffer(80);

        expect(offerId).toBe(80);
    });
});

describe("rentalModel.endAgreement", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should record the termination and work out who holds the stall now", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query
            .mockResolvedValueOnce({ recordset: [{ StallID: 3 }] }) // TerminatedOn written
            .mockResolvedValueOnce({ rowsAffected: [1] }); // the stall is reassigned

        const stallId = await Rental.endAgreement(50, "2026-08-31");

        expect(transactionRequest.input).toHaveBeenCalledWith(
            "TerminatedOn",
            expect.anything(),
            "2026-08-31"
        );
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(stallId).toBe(3);
    });

    it("should return null when the tenancy was never signed or is already ended", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockResolvedValueOnce({ recordset: [] });

        const stallId = await Rental.endAgreement(50, "2026-08-31");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(stallId).toBeNull();
    });

    it("should roll back and rethrow when the database fails", async () => {
        mockConnection();
        const { transaction, transactionRequest } = mockTransaction();

        transactionRequest.query.mockRejectedValue(new Error("Database Error"));

        await expect(Rental.endAgreement(50, "2026-08-31")).rejects.toThrow(
            "Database Error"
        );

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });
});
