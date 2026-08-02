const swaggerAutogen = require("swagger-autogen")();

const outputFile = "./swagger-output.json"; // Output file for the spec
const routes = ["./app.js"]; // Path to your API route files

const doc = {
    info: {
        title: "HawkerHubSG API",
        description:
            "REST API for the Singapore Hawker Centre Management System. " +
            "Customers browse stalls and place orders, vendors run their stall " +
            "and its menu, hawker centre operators let their stalls to vendors, " +
            "and NEA officers record hygiene inspections.",
        version: "1.0.0",
    },
    host: "localhost:3000",
    basePath: "/",
    schemes: ["http"],
    consumes: ["application/json"],
    produces: ["application/json"],

    /*
     * Most endpoints read the account from a JWT. Sign in through POST /login,
     * copy the token out of the response and paste "Bearer <token>" into the
     * Authorize box, otherwise every protected endpoint answers 401.
     */
    securityDefinitions: {
        bearerAuth: {
            type: "apiKey",
            name: "Authorization",
            in: "header",
            description:
                "JWT from POST /login. Enter it as: Bearer <your token>",
        },
    },

    tags: [
        {
            name: "Authentication",
            description: "Register an account and sign in for a token",
        },
        {
            name: "Food Stalls",
            description: "Browsing stalls and menus, open to everyone",
        },
        {
            name: "Vendor Menu Management",
            description: "A vendor manages the stall assigned to their account",
        },
        {
            name: "Rental Agreements",
            description: "The tenancy of a stall between an operator and a vendor",
        },
        {
            name: "Tenancy Offers",
            description:
                "Terms the operator puts to a vendor, which only the vendor can sign",
        },
        {
            name: "Notifications",
            description: "The inbox of the signed in account",
        },
        {
            name: "Review Replies",
            description: "A vendor's public answer to a customer review",
        },
        { name: "Orders", description: "Placing and progressing food orders" },
        { name: "Order History", description: "Past and active orders of a customer" },
        { name: "Payments", description: "Checkout and payment records" },
        { name: "Feedback", description: "Customer reviews of a food stall" },
        { name: "Inspections", description: "NEA hygiene inspections and grades" },
        { name: "Complaints", description: "Complaints raised against a stall" },
        { name: "Analytics", description: "Sales figures for a vendor's own stall" },
    ],

    /*
     * Request bodies, written to match the Joi schemas in middlewares/ so the
     * example shown in Swagger UI is one the validation actually accepts.
     */
    definitions: {
        Register: {
            Username: "raynetan",
            Email: "rayne@example.com",
            Password: "Password123",
            Role: "customer",
        },
        Login: {
            Email: "rayne@example.com",
            Password: "Password123",
        },
        MenuItem: {
            ItemName: "Laksa",
            ItemDesc: "Rice noodles in a coconut curry broth",
            ItemPrice: 5.5,
            ItemCategory: "Main",
            ItemImage: "images/laksa.jpg",
            IsAvailable: true,
        },
        MenuItemAvailability: {
            IsAvailable: false,
        },
        StallUpdate: {
            StallName: "Rayne's Rojak",
            StallDesc: "Traditional rojak made to order",
            StallImage: "images/rojak.jpg",
            IsActive: true,
        },
        Agreement: {
            StallID: 3,
            VendorUserID: 7,
            StartDate: "2026-09-01",
            EndDate: "2027-08-31",
            RentalPrice: 1200,
            TermCondition: "Rent is payable on the first day of each month",
        },
        Renewal: {
            EndDate: "2028-08-31",
            RentalPrice: 1300,
            OfferNote: "Rent rises with the new maintenance charge",
        },
        TenancyEnd: {
            EndDate: "2026-08-31",
        },
        OfferSignature: {
            SignatureName: "louisvendor",
            Agree: true,
        },
        OfferRejection: {
            ResponseNote: "The proposed rent is more than the stall can carry",
        },
        Reply: {
            ReplyText: "Thank you for the kind words, see you again soon!",
        },
        MemberOrder: {
            OrderType: "Member",
            SpecialInstructions: "Less chilli please",
            items: [{ MenuItemID: 1, Quantity: 2 }],
        },
        GuestOrder: {
            OrderType: "Guest",
            GuestName: "Guest Lee",
            GuestEmail: "guest@example.com",
            SpecialInstructions: "No spring onion",
            items: [{ MenuItemID: 1, Quantity: 1 }],
        },
        OrderStatus: {
            OrderStatus: "Preparing",
        },
        GuestOrderReference: {
            GuestOrderReference: "GUEST-ABC123-XYZ789",
        },
        GuestOrderLookup: {
            OrderID: 4,
            GuestOrderReference: "GUEST-ABC123-XYZ789",
        },
        Payment: {
            OrderID: 4,
            PaymentMethod: "PayNow",
            TransactionReference: "PN-20260801-0001",
            GuestOrderReference: "GUEST-ABC123-XYZ789",
        },
        PaymentStatus: {
            PaymentStatus: "Successful",
        },
        PaymentMethodUpdate: {
            PaymentMethod: "Card",
            TransactionReference: "CARD-20260801-0001",
            GuestOrderReference: "GUEST-ABC123-XYZ789",
        },
        AccountAvailability: {
            Username: "newguest",
            Email: "guest@example.com",
        },
        Feedback: {
            StallID: 3,
            Rating: 5,
            ReviewComment: "The laksa here is the best in the east",
        },
        Inspection: {
            stall_id: 3,
            score: 90,
            remarks: "Preparation area clean, utensils stored correctly",
        },
        Complaint: {
            stall_id: 3,
            complaint_title: "Tray was not cleaned",
            complaint_desc: "The tray handed over still had food on it",
        },
        ComplaintStatus: {
            status: "Resolved",
        },
        Error: {
            error: "A message explaining what went wrong",
        },
    },
};

swaggerAutogen(outputFile, routes, doc);
