// rentalController.test.js
// Unit tests for the Stall Rental Agreement and Tenancy Offer controller

const rentalController = require("../controllers/rentalController");
const rentalModel = require("../models/rentalModel");
const notificationModel = require("../models/notificationModel");

// Mock both models this controller uses
jest.mock("../models/rentalModel");
jest.mock("../models/notificationModel");

function mockResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    };
}

const operatorUser = { id: 2, role: "operator" };
const vendorUser = { id: 7, role: "vendor" };

describe("rentalController.getAgreements", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return only the vendor's own agreements", async () => {
        const mockAgreements = [{ AgreementID: 1 }, { AgreementID: 2 }];

        rentalModel.getAgreements.mockResolvedValue(mockAgreements);

        const req = { user: vendorUser, agreementStatus: null };
        const res = mockResponse();

        await rentalController.getAgreements(req, res);

        // A vendor is scoped to their own ID and never to an operator
        expect(rentalModel.getAgreements).toHaveBeenCalledWith({
            vendorUserId: 7,
            operatorId: null,
            status: null,
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            agreementCount: 2,
            agreements: mockAgreements,
        });
    });

    it("should scope an operator to the operator resolved from the database", async () => {
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });
        rentalModel.getAgreements.mockResolvedValue([]);

        const req = { user: operatorUser, agreementStatus: "Active" };
        const res = mockResponse();

        await rentalController.getAgreements(req, res);

        expect(rentalModel.getOperatorIdForUser).toHaveBeenCalledWith(2);
        expect(rentalModel.getAgreements).toHaveBeenCalledWith({
            vendorUserId: null,
            operatorId: 1,
            status: "Active",
        });
    });

    it("should return a 403 status when the operator account is linked to no operator", async () => {
        rentalModel.getOperatorIdForUser.mockResolvedValue(null);

        const req = { user: operatorUser, agreementStatus: null };
        const res = mockResponse();

        await rentalController.getAgreements(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "Your account is not linked to a hawker centre operator",
        });
        expect(rentalModel.getAgreements).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getAgreements.mockRejectedValue(new Error("Database error"));

        const req = { user: vendorUser, agreementStatus: null };
        const res = mockResponse();

        await rentalController.getAgreements(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve rental agreements",
        });
    });
});

describe("rentalController.getExpiringAgreements", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the agreements expiring inside the requested window", async () => {
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });
        rentalModel.getExpiringAgreements.mockResolvedValue([{ AgreementID: 1 }]);

        const req = { user: operatorUser, expiryWindow: 30 };
        const res = mockResponse();

        await rentalController.getExpiringAgreements(req, res);

        expect(rentalModel.getExpiringAgreements).toHaveBeenCalledWith(30, 1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            days: 30,
            agreementCount: 1,
            agreements: [{ AgreementID: 1 }],
        });
    });

    it("should return a 403 status when the account is linked to no operator", async () => {
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: null });

        const req = { user: operatorUser, expiryWindow: 30 };
        const res = mockResponse();

        await rentalController.getExpiringAgreements(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getOperatorIdForUser.mockRejectedValue(new Error("Database error"));

        const req = { user: operatorUser, expiryWindow: 30 };
        const res = mockResponse();

        await rentalController.getExpiringAgreements(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve expiring rental agreements",
        });
    });
});

describe("rentalController.getManagedStalls", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the stalls the operator is responsible for", async () => {
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });
        rentalModel.getManagedStalls.mockResolvedValue([
            { StallID: 3 },
            { StallID: 4 },
        ]);

        const req = { user: operatorUser };
        const res = mockResponse();

        await rentalController.getManagedStalls(req, res);

        expect(rentalModel.getManagedStalls).toHaveBeenCalledWith(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            stallCount: 2,
            stalls: [{ StallID: 3 }, { StallID: 4 }],
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });
        rentalModel.getManagedStalls.mockRejectedValue(new Error("Database error"));

        const req = { user: operatorUser };
        const res = mockResponse();

        await rentalController.getManagedStalls(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve the stalls you manage",
        });
    });
});

describe("rentalController.getManagedCentres", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the hawker centres the operator runs", async () => {
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });
        rentalModel.getManagedCentres.mockResolvedValue([{ HawkerCentreID: 1 }]);

        const req = { user: operatorUser };
        const res = mockResponse();

        await rentalController.getManagedCentres(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            centreCount: 1,
            centres: [{ HawkerCentreID: 1 }],
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });
        rentalModel.getManagedCentres.mockRejectedValue(new Error("Database error"));

        const req = { user: operatorUser };
        const res = mockResponse();

        await rentalController.getManagedCentres(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve the hawker centres you manage",
        });
    });
});

describe("rentalController.getVendorAccounts", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the vendor accounts an agreement can name", async () => {
        rentalModel.getVendorAccounts.mockResolvedValue([
            { UserID: 7, Username: "louisvendor", StallCount: 0 },
        ]);

        const req = { user: operatorUser };
        const res = mockResponse();

        await rentalController.getVendorAccounts(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            vendorCount: 1,
            vendors: [{ UserID: 7, Username: "louisvendor", StallCount: 0 }],
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getVendorAccounts.mockRejectedValue(new Error("Database error"));

        const req = { user: operatorUser };
        const res = mockResponse();

        await rentalController.getVendorAccounts(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve vendor accounts",
        });
    });
});

describe("rentalController.getAgreementById", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the agreement to the vendor it belongs to", async () => {
        const agreement = { AgreementID: 1, VendorUserID: 7, OperatorID: 1 };

        rentalModel.getAgreementById.mockResolvedValue(agreement);

        const req = { params: { id: "1" }, user: vendorUser };
        const res = mockResponse();

        await rentalController.getAgreementById(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(agreement);
    });

    it("should return the agreement to the operator of its hawker centre", async () => {
        const agreement = { AgreementID: 1, VendorUserID: 7, OperatorID: 1 };

        rentalModel.getAgreementById.mockResolvedValue(agreement);
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });

        const req = { params: { id: "1" }, user: operatorUser };
        const res = mockResponse();

        await rentalController.getAgreementById(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(agreement);
    });

    it("should return a 404 status when the agreement does not exist", async () => {
        rentalModel.getAgreementById.mockResolvedValue(null);

        const req = { params: { id: "999" }, user: vendorUser };
        const res = mockResponse();

        await rentalController.getAgreementById(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Rental agreement not found" });
    });

    it("should return a 403 status for a vendor reading somebody else's agreement", async () => {
        rentalModel.getAgreementById.mockResolvedValue({
            AgreementID: 1,
            VendorUserID: 12,
            OperatorID: 1,
        });

        const req = { params: { id: "1" }, user: vendorUser };
        const res = mockResponse();

        await rentalController.getAgreementById(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "You can only view your own rental agreements",
        });
    });

    it("should return a 403 status for an operator reading another centre's agreement", async () => {
        rentalModel.getAgreementById.mockResolvedValue({
            AgreementID: 1,
            VendorUserID: 7,
            OperatorID: 2,
        });
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });

        const req = { params: { id: "1" }, user: operatorUser };
        const res = mockResponse();

        await rentalController.getAgreementById(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "This stall is in a hawker centre you do not manage",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getAgreementById.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "1" }, user: vendorUser };
        const res = mockResponse();

        await rentalController.getAgreementById(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve the rental agreement",
        });
    });
});

describe("rentalController.createAgreement", () => {
    const agreementBody = {
        StallID: 3,
        VendorUserID: 7,
        StartDate: "2026-09-01",
        EndDate: "2027-08-31",
        RentalPrice: 1200,
        TermCondition: "Standard terms",
    };

    beforeEach(() => {
        jest.clearAllMocks();
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });
    });

    it("should offer the tenancy to the vendor and return a 201 status", async () => {
        rentalModel.getStallById.mockResolvedValue({
            StallID: 3,
            StallName: "Rayne's Rojak",
            HCName: "Bedok Hawker Centre",
            OperatorID: 1,
        });
        rentalModel.getVendorById.mockResolvedValue({
            UserID: 7,
            Username: "louisvendor",
            Role: "vendor",
        });
        rentalModel.findOverlappingAgreement.mockResolvedValue(null);
        rentalModel.createAgreement.mockResolvedValue(50);
        rentalModel.createOffer.mockResolvedValue(80);
        rentalModel.getOfferById.mockResolvedValue({
            OfferID: 80,
            OperatorName: "Bedok Operator",
            StallUnitNo: "01-23",
            HCName: "Bedok Hawker Centre",
        });
        rentalModel.getAgreementById.mockResolvedValue({ AgreementID: 50 });

        const req = { body: agreementBody, user: operatorUser };
        const res = mockResponse();

        await rentalController.createAgreement(req, res);

        // The agreement is written unsigned and then put to the vendor
        expect(rentalModel.createAgreement).toHaveBeenCalledWith(agreementBody);
        expect(rentalModel.createOffer).toHaveBeenCalledWith({
            agreementId: 50,
            offerType: "New Tenancy",
            offeredByUserId: 2,
            proposedEndDate: "2027-08-31",
            proposedRentalPrice: 1200,
            offerNote: "Standard terms",
        });
        expect(notificationModel.createNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                recipientUserId: 7,
                notificationType: "Agreement Offer",
                title: "Tenancy offer for Rayne's Rojak",
                offerId: 80,
            })
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    "The tenancy of Rayne's Rojak has been sent to louisvendor for signature. " +
                    "The stall stays vacant until they sign it.",
            })
        );
    });

    it("should return a 404 status when the stall does not exist", async () => {
        rentalModel.getStallById.mockResolvedValue(null);

        const req = { body: agreementBody, user: operatorUser };
        const res = mockResponse();

        await rentalController.createAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Food stall not found" });
        expect(rentalModel.createAgreement).not.toHaveBeenCalled();
    });

    it("should return a 403 status when the stall is in another operator's centre", async () => {
        rentalModel.getStallById.mockResolvedValue({
            StallID: 3,
            StallName: "Rayne's Rojak",
            HCName: "Tampines Hawker Centre",
            OperatorID: 2,
        });

        const req = { body: agreementBody, user: operatorUser };
        const res = mockResponse();

        await rentalController.createAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error:
                "Rayne's Rojak is in Tampines Hawker Centre, which is run by another operator",
        });
    });

    it("should return a 404 status when the vendor account does not exist", async () => {
        rentalModel.getStallById.mockResolvedValue({
            StallID: 3,
            StallName: "Rayne's Rojak",
            HCName: "Bedok Hawker Centre",
            OperatorID: 1,
        });
        rentalModel.getVendorById.mockResolvedValue(null);

        const req = { body: agreementBody, user: operatorUser };
        const res = mockResponse();

        await rentalController.createAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Vendor account not found" });
    });

    it("should return a 400 status when the account named is not a vendor", async () => {
        rentalModel.getStallById.mockResolvedValue({
            StallID: 3,
            StallName: "Rayne's Rojak",
            HCName: "Bedok Hawker Centre",
            OperatorID: 1,
        });
        rentalModel.getVendorById.mockResolvedValue({
            UserID: 5,
            Username: "mervincustomer",
            Role: "customer",
        });

        const req = { body: agreementBody, user: operatorUser };
        const res = mockResponse();

        await rentalController.createAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "The selected account is not a vendor account",
        });
    });

    it("should return a 409 status when the stall is already let over that period", async () => {
        rentalModel.getStallById.mockResolvedValue({
            StallID: 3,
            StallName: "Rayne's Rojak",
            HCName: "Bedok Hawker Centre",
            OperatorID: 1,
        });
        rentalModel.getVendorById.mockResolvedValue({
            UserID: 7,
            Username: "louisvendor",
            Role: "vendor",
        });
        rentalModel.findOverlappingAgreement.mockResolvedValue({
            AgreementID: 9,
            VendorName: "someoneelse",
            StartDate: "2026-01-01",
            EndDate: "2026-12-31",
        });

        const req = { body: agreementBody, user: operatorUser };
        const res = mockResponse();

        await rentalController.createAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error:
                "This stall is already rented to someoneelse between 2026-01-01 and 2026-12-31",
        });
        expect(rentalModel.createAgreement).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getStallById.mockRejectedValue(new Error("Database error"));

        const req = { body: agreementBody, user: operatorUser };
        const res = mockResponse();

        await rentalController.createAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to offer the rental agreement",
        });
    });
});

describe("rentalController.renewAgreement", () => {
    const runningAgreement = {
        AgreementID: 50,
        StallID: 3,
        StallName: "Rayne's Rojak",
        VendorUserID: 7,
        VendorName: "louisvendor",
        OperatorID: 1,
        StartDate: "2026-01-01",
        EndDate: "2026-12-31",
        RentalPrice: 1200,
        AcceptedOn: "2026-01-01T00:00:00.000Z",
        CancelledOn: null,
        TerminatedOn: null,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });
    });

    it("should put the renewal to the vendor and return a 201 status", async () => {
        rentalModel.getAgreementById.mockResolvedValue(runningAgreement);
        rentalModel.findOverlappingAgreement.mockResolvedValue(null);
        rentalModel.findOpenOffer.mockResolvedValue(null);
        rentalModel.createOffer.mockResolvedValue(81);
        rentalModel.getOfferById.mockResolvedValue({
            OfferID: 81,
            OperatorName: "Bedok Operator",
        });

        const req = {
            params: { id: "50" },
            body: { EndDate: "2027-12-31", RentalPrice: 1300 },
            user: operatorUser,
        };
        const res = mockResponse();

        await rentalController.renewAgreement(req, res);

        // The running agreement is left untouched until the vendor signs
        expect(rentalModel.createOffer).toHaveBeenCalledWith({
            agreementId: 50,
            offeredByUserId: 2,
            proposedEndDate: "2027-12-31",
            proposedRentalPrice: 1300,
            offerNote: null,
        });
        expect(notificationModel.createNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                recipientUserId: 7,
                notificationType: "Agreement Offer",
                title: "Renewal offer for Rayne's Rojak",
                offerId: 81,
            })
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    "The renewal has been sent to louisvendor for signature. " +
                    "The current agreement stays in force until they sign it.",
            })
        );
    });

    it("should keep the current rent when no new price is proposed", async () => {
        rentalModel.getAgreementById.mockResolvedValue(runningAgreement);
        rentalModel.findOverlappingAgreement.mockResolvedValue(null);
        rentalModel.findOpenOffer.mockResolvedValue(null);
        rentalModel.createOffer.mockResolvedValue(81);
        rentalModel.getOfferById.mockResolvedValue({
            OfferID: 81,
            OperatorName: "Bedok Operator",
        });

        const req = {
            params: { id: "50" },
            body: { EndDate: "2027-12-31" },
            user: operatorUser,
        };
        const res = mockResponse();

        await rentalController.renewAgreement(req, res);

        expect(rentalModel.createOffer).toHaveBeenCalledWith(
            expect.objectContaining({ proposedRentalPrice: 1200 })
        );
    });

    it("should return a 404 status when the agreement does not exist", async () => {
        rentalModel.getAgreementById.mockResolvedValue(null);

        const req = {
            params: { id: "999" },
            body: { EndDate: "2027-12-31" },
            user: operatorUser,
        };
        const res = mockResponse();

        await rentalController.renewAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return a 403 status when the stall is in another operator's centre", async () => {
        rentalModel.getAgreementById.mockResolvedValue({
            ...runningAgreement,
            OperatorID: 2,
        });

        const req = {
            params: { id: "50" },
            body: { EndDate: "2027-12-31" },
            user: operatorUser,
        };
        const res = mockResponse();

        await rentalController.renewAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return a 409 status when the tenancy was already ended", async () => {
        rentalModel.getAgreementById.mockResolvedValue({
            ...runningAgreement,
            TerminatedOn: "2026-06-30T00:00:00.000Z",
        });

        const req = {
            params: { id: "50" },
            body: { EndDate: "2027-12-31" },
            user: operatorUser,
        };
        const res = mockResponse();

        await rentalController.renewAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "This tenancy was ended on 2026-06-30 and can no longer be renewed",
        });
    });

    it("should return a 409 status when the vendor has not signed the tenancy yet", async () => {
        rentalModel.getAgreementById.mockResolvedValue({
            ...runningAgreement,
            AcceptedOn: null,
        });

        const req = {
            params: { id: "50" },
            body: { EndDate: "2027-12-31" },
            user: operatorUser,
        };
        const res = mockResponse();

        await rentalController.renewAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error:
                "louisvendor has not signed this tenancy yet, so it cannot be renewed until they answer the offer.",
        });
    });

    it("should return a 409 status when the new end date is not later", async () => {
        rentalModel.getAgreementById.mockResolvedValue(runningAgreement);

        const req = {
            params: { id: "50" },
            body: { EndDate: "2026-06-30" },
            user: operatorUser,
        };
        const res = mockResponse();

        await rentalController.renewAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "The new end date must be later than the current end date of 2026-12-31",
        });
    });

    it("should return a 409 status when the vendor is already holding an offer", async () => {
        rentalModel.getAgreementById.mockResolvedValue(runningAgreement);
        rentalModel.findOverlappingAgreement.mockResolvedValue(null);
        rentalModel.findOpenOffer.mockResolvedValue({ OfferID: 80 });

        const req = {
            params: { id: "50" },
            body: { EndDate: "2027-12-31" },
            user: operatorUser,
        };
        const res = mockResponse();

        await rentalController.renewAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error:
                "louisvendor is already holding an offer on this tenancy. Withdraw it before sending another.",
            offer: { OfferID: 80 },
        });
        expect(rentalModel.createOffer).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getAgreementById.mockRejectedValue(new Error("Database error"));

        const req = {
            params: { id: "50" },
            body: { EndDate: "2027-12-31" },
            user: operatorUser,
        };
        const res = mockResponse();

        await rentalController.renewAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to send the renewal to the vendor",
        });
    });
});

describe("rentalController.getOffers", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the offers put to a vendor with a pending count", async () => {
        rentalModel.getOffers.mockResolvedValue([
            { OfferID: 1, OfferStatus: "Pending Signature" },
            { OfferID: 2, OfferStatus: "Signed" },
        ]);

        const req = { user: vendorUser, offerStatus: null };
        const res = mockResponse();

        await rentalController.getOffers(req, res);

        expect(rentalModel.getOffers).toHaveBeenCalledWith({
            vendorUserId: 7,
            operatorId: null,
            status: null,
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            offerCount: 2,
            pendingCount: 1,
            offers: [
                { OfferID: 1, OfferStatus: "Pending Signature" },
                { OfferID: 2, OfferStatus: "Signed" },
            ],
        });
    });

    it("should scope an operator to their own hawker centres", async () => {
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });
        rentalModel.getOffers.mockResolvedValue([]);

        const req = { user: operatorUser, offerStatus: "Pending Signature" };
        const res = mockResponse();

        await rentalController.getOffers(req, res);

        expect(rentalModel.getOffers).toHaveBeenCalledWith({
            vendorUserId: null,
            operatorId: 1,
            status: "Pending Signature",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getOffers.mockRejectedValue(new Error("Database error"));

        const req = { user: vendorUser, offerStatus: null };
        const res = mockResponse();

        await rentalController.getOffers(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to retrieve the tenancy offers",
        });
    });
});

describe("rentalController.signOffer", () => {
    const pendingOffer = {
        OfferID: 80,
        AgreementID: 50,
        OfferType: "New Tenancy",
        OfferStatus: "Pending Signature",
        OfferedByUserID: 2,
        VendorUserID: 7,
        VendorName: "louisvendor",
        StallName: "Rayne's Rojak",
        StartDate: "2026-09-01",
        ProposedEndDate: "2027-08-31",
        ProposedRentalPrice: 1200,
        RespondedAt: null,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should accept the signature and return a 200 status", async () => {
        rentalModel.getOfferById
            .mockResolvedValueOnce(pendingOffer)
            .mockResolvedValueOnce({ ...pendingOffer, OfferStatus: "Signed" });
        rentalModel.signOffer.mockResolvedValue(50);
        rentalModel.getAgreementById.mockResolvedValue({ AgreementID: 50 });

        const req = {
            params: { offerId: "80" },
            body: { SignatureName: "louisvendor" },
            user: vendorUser,
        };
        const res = mockResponse();

        await rentalController.signOffer(req, res);

        // The signature is stored as a hash of the exact terms that were agreed
        expect(rentalModel.signOffer).toHaveBeenCalledWith(
            80,
            "louisvendor",
            expect.stringMatching(/^[a-f0-9]{64}$/)
        );
        expect(notificationModel.createNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                recipientUserId: 2,
                notificationType: "Agreement Signed",
                offerId: 80,
            })
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    "You have taken on Rayne's Rojak. Your tenancy runs from 2026-09-01 to " +
                    "2027-08-31 at $1200.00 per month.",
            })
        );
    });

    it("should return a 404 status when the offer does not exist", async () => {
        rentalModel.getOfferById.mockResolvedValue(null);

        const req = {
            params: { offerId: "999" },
            body: { SignatureName: "louisvendor" },
            user: vendorUser,
        };
        const res = mockResponse();

        await rentalController.signOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Tenancy offer not found" });
    });

    it("should return a 403 status when the offer was made to another vendor", async () => {
        rentalModel.getOfferById.mockResolvedValue({
            ...pendingOffer,
            VendorUserID: 12,
        });

        const req = {
            params: { offerId: "80" },
            body: { SignatureName: "louisvendor" },
            user: vendorUser,
        };
        const res = mockResponse();

        await rentalController.signOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "This offer was made to another vendor",
        });
    });

    it("should return a 409 status when the offer was already answered", async () => {
        rentalModel.getOfferById.mockResolvedValue({
            ...pendingOffer,
            OfferStatus: "Rejected",
            RespondedAt: "2026-07-20T00:00:00.000Z",
        });

        const req = {
            params: { offerId: "80" },
            body: { SignatureName: "louisvendor" },
            user: vendorUser,
        };
        const res = mockResponse();

        await rentalController.signOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "This offer was already rejected on 2026-07-20",
        });
    });

    it("should return a 400 status when the signature does not match the account name", async () => {
        rentalModel.getOfferById.mockResolvedValue(pendingOffer);

        const req = {
            params: { offerId: "80" },
            body: { SignatureName: "somebody else" },
            user: vendorUser,
        };
        const res = mockResponse();

        await rentalController.signOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "The signature must match your account name, louisvendor",
        });
        expect(rentalModel.signOffer).not.toHaveBeenCalled();
    });

    it("should return a 409 status when another request answered it first", async () => {
        rentalModel.getOfferById.mockResolvedValue(pendingOffer);
        rentalModel.signOffer.mockResolvedValue(null);

        const req = {
            params: { offerId: "80" },
            body: { SignatureName: "louisvendor" },
            user: vendorUser,
        };
        const res = mockResponse();

        await rentalController.signOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "This offer has already been answered",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getOfferById.mockRejectedValue(new Error("Database error"));

        const req = {
            params: { offerId: "80" },
            body: { SignatureName: "louisvendor" },
            user: vendorUser,
        };
        const res = mockResponse();

        await rentalController.signOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to sign the tenancy offer",
        });
    });
});

describe("rentalController.rejectOffer", () => {
    const pendingOffer = {
        OfferID: 80,
        AgreementID: 50,
        OfferType: "New Tenancy",
        OfferStatus: "Pending Signature",
        OfferedByUserID: 2,
        VendorUserID: 7,
        VendorName: "louisvendor",
        StallName: "Rayne's Rojak",
        ProposedEndDate: "2027-08-31",
        ProposedRentalPrice: 1200,
        CurrentEndDate: "2026-12-31",
        CurrentRentalPrice: 1000,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should turn down a new tenancy and leave the vendor's stalls alone", async () => {
        rentalModel.getOfferById
            .mockResolvedValueOnce(pendingOffer)
            .mockResolvedValueOnce({ ...pendingOffer, OfferStatus: "Rejected" });
        rentalModel.rejectOffer.mockResolvedValue(80);

        const req = {
            params: { offerId: "80" },
            body: { ResponseNote: "Too expensive" },
            user: vendorUser,
        };
        const res = mockResponse();

        await rentalController.rejectOffer(req, res);

        expect(rentalModel.rejectOffer).toHaveBeenCalledWith(80, "Too expensive");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    "You turned down Rayne's Rojak. The offer was cancelled and nothing " +
                    "about your existing stalls has changed.",
            })
        );
    });

    it("should leave a rejected renewal on its current terms", async () => {
        const renewalOffer = { ...pendingOffer, OfferType: "Renewal" };

        rentalModel.getOfferById
            .mockResolvedValueOnce(renewalOffer)
            .mockResolvedValueOnce({ ...renewalOffer, OfferStatus: "Rejected" });
        rentalModel.rejectOffer.mockResolvedValue(80);

        const req = {
            params: { offerId: "80" },
            body: {},
            user: vendorUser,
        };
        const res = mockResponse();

        await rentalController.rejectOffer(req, res);

        expect(rentalModel.rejectOffer).toHaveBeenCalledWith(80, null);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    "The offer was rejected and cancelled. The tenancy stays on its current " +
                    "terms of $1000.00 per month until 2026-12-31.",
            })
        );
    });

    it("should return a 409 status when the offer was already answered", async () => {
        rentalModel.getOfferById.mockResolvedValue(pendingOffer);
        rentalModel.rejectOffer.mockResolvedValue(null);

        const req = { params: { offerId: "80" }, body: {}, user: vendorUser };
        const res = mockResponse();

        await rentalController.rejectOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "This offer has already been answered",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getOfferById.mockRejectedValue(new Error("Database error"));

        const req = { params: { offerId: "80" }, body: {}, user: vendorUser };
        const res = mockResponse();

        await rentalController.rejectOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to reject the tenancy offer",
        });
    });
});

describe("rentalController.withdrawOffer", () => {
    const pendingOffer = {
        OfferID: 80,
        OfferType: "New Tenancy",
        OfferStatus: "Pending Signature",
        OperatorID: 1,
        VendorName: "louisvendor",
        StallName: "Rayne's Rojak",
    };

    beforeEach(() => {
        jest.clearAllMocks();
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });
    });

    it("should take back an unanswered offer and return a 200 status", async () => {
        rentalModel.getOfferById
            .mockResolvedValueOnce(pendingOffer)
            .mockResolvedValueOnce({ ...pendingOffer, OfferStatus: "Withdrawn" });
        rentalModel.withdrawOffer.mockResolvedValue(80);

        const req = { params: { offerId: "80" }, user: operatorUser };
        const res = mockResponse();

        await rentalController.withdrawOffer(req, res);

        expect(rentalModel.withdrawOffer).toHaveBeenCalledWith(80);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    "The offer to louisvendor was withdrawn. Rayne's Rojak is free to offer " +
                    "to another vendor.",
            })
        );
    });

    it("should return a 404 status when the offer does not exist", async () => {
        rentalModel.getOfferById.mockResolvedValue(null);

        const req = { params: { offerId: "999" }, user: operatorUser };
        const res = mockResponse();

        await rentalController.withdrawOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return a 403 status when the stall is in another operator's centre", async () => {
        rentalModel.getOfferById.mockResolvedValue({ ...pendingOffer, OperatorID: 2 });

        const req = { params: { offerId: "80" }, user: operatorUser };
        const res = mockResponse();

        await rentalController.withdrawOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(rentalModel.withdrawOffer).not.toHaveBeenCalled();
    });

    it("should return a 409 status when the vendor already answered", async () => {
        rentalModel.getOfferById.mockResolvedValue({
            ...pendingOffer,
            OfferStatus: "Signed",
        });
        rentalModel.withdrawOffer.mockResolvedValue(null);

        const req = { params: { offerId: "80" }, user: operatorUser };
        const res = mockResponse();

        await rentalController.withdrawOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "This offer was already signed and can no longer be withdrawn",
        });
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getOfferById.mockRejectedValue(new Error("Database error"));

        const req = { params: { offerId: "80" }, user: operatorUser };
        const res = mockResponse();

        await rentalController.withdrawOffer(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Unable to withdraw the tenancy offer",
        });
    });
});

describe("rentalController.endAgreement", () => {
    const runningAgreement = {
        AgreementID: 50,
        StallID: 3,
        StallName: "Rayne's Rojak",
        VendorName: "louisvendor",
        OperatorID: 1,
        AcceptedOn: "2026-01-01T00:00:00.000Z",
        CancelledOn: null,
        TerminatedOn: null,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        rentalModel.getOperatorIdForUser.mockResolvedValue({ OperatorID: 1 });
    });

    it("should end the tenancy on the named day and return a 200 status", async () => {
        rentalModel.getAgreementById
            .mockResolvedValueOnce(runningAgreement)
            .mockResolvedValueOnce({
                ...runningAgreement,
                TerminatedOn: "2026-08-31T00:00:00.000Z",
            });
        rentalModel.endAgreement.mockResolvedValue(3);

        const req = {
            params: { id: "50" },
            body: { EndDate: "2026-08-31" },
            user: operatorUser,
        };
        const res = mockResponse();

        await rentalController.endAgreement(req, res);

        expect(rentalModel.endAgreement).toHaveBeenCalledWith(50, "2026-08-31");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Tenancy of Rayne's Rojak ended" })
        );
    });

    it("should return a 404 status when the agreement does not exist", async () => {
        rentalModel.getAgreementById.mockResolvedValue(null);

        const req = { params: { id: "999" }, body: {}, user: operatorUser };
        const res = mockResponse();

        await rentalController.endAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return a 403 status when the stall is in another operator's centre", async () => {
        rentalModel.getAgreementById.mockResolvedValue({
            ...runningAgreement,
            OperatorID: 2,
        });

        const req = { params: { id: "50" }, body: {}, user: operatorUser };
        const res = mockResponse();

        await rentalController.endAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return a 409 status when the tenancy was already ended", async () => {
        rentalModel.getAgreementById.mockResolvedValue({
            ...runningAgreement,
            TerminatedOn: "2026-06-30T00:00:00.000Z",
        });

        const req = { params: { id: "50" }, body: {}, user: operatorUser };
        const res = mockResponse();

        await rentalController.endAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: "This tenancy was already ended on 2026-06-30",
        });
    });

    it("should tell the operator to withdraw the offer when the vendor has not signed", async () => {
        rentalModel.getAgreementById.mockResolvedValue({
            ...runningAgreement,
            AcceptedOn: null,
        });

        const req = { params: { id: "50" }, body: {}, user: operatorUser };
        const res = mockResponse();

        await rentalController.endAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error:
                "louisvendor has not signed this tenancy yet. Withdraw the offer instead of ending it.",
        });
        expect(rentalModel.endAgreement).not.toHaveBeenCalled();
    });

    it("should handle errors and return a 500 status with an error message", async () => {
        rentalModel.getAgreementById.mockRejectedValue(new Error("Database error"));

        const req = { params: { id: "50" }, body: {}, user: operatorUser };
        const res = mockResponse();

        await rentalController.endAgreement(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Unable to end the tenancy" });
    });
});
