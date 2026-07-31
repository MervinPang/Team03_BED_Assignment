// Authorization Middleware - Verifies JWT tokens and checks user roles 
const jwt = require("jsonwebtoken");

function verifyJWT(req, res, next) {
    const authorizationHeader = req.headers.authorization;

    if (!authorizationHeader) {
        return res.status(401).json({ error: "Authentication token is required" });
    }

    const [scheme, token] = authorizationHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({
            error: "Authorization header must use the Bearer token format",
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
        if (error) {
            console.error("JWT verification error:", error.message);
            return res.status(403).json({ error: "Invalid or expired authentication token" });
        }

        const authorizedRoles = {
            // Only customers can submit feedback
            "POST /feedback": ["customer"],
            "PUT /feedback/[0-9]+": ["customer"],
            "DELETE /feedback/[0-9]+": ["customer"],

            // Vendor
            "GET /vendors/me/stalls": ["vendor"],

            // Operator
            // The tenancy form needs the vendors to choose from and the stalls
            // inside the hawker centres this operator is responsible for
            "GET /vendors": ["operator"],
            "GET /operators/me/stalls": ["operator"],
            "GET /operators/me/centres": ["operator"],

            // Orders
            "GET /orders": ["customer", "vendor", "nea_officer"],
            "GET /orders/[0-9]+": ["customer", "vendor", "nea_officer"],
            "POST /orders": ["customer"],
            "PUT /orders/[0-9]+/status": ["vendor"],
            "DELETE /orders/[0-9]+": ["customer"],

            // Order History
            "GET /order-history/active": ["customer"],
            "GET /order-history/previous": ["customer"],
            "GET /order-history/most-frequent": ["customer"],
            "GET /order-history/[^/]+": ["customer"],

            // Payments
            "GET /payments": ["customer", "vendor"],
            "GET /payments/[0-9]+": ["customer", "vendor"],
            "GET /payments/order/[0-9]+": ["customer", "vendor"],
            "PUT /payments/[0-9]+/status": ["vendor"],
            "DELETE /payments/[0-9]+": ["customer"],

            // Inspections
            // An operator reads the grades of the stalls in its own centres
            "POST /inspections": ["nea_officer"],
            "GET /inspections/[0-9]+": ["customer", "vendor", "nea_officer", "operator"],

            // Complaints
            // A case is decided by the operator of the hawker centre the stall
            // stands in. Everyone else, the NEA officer included, only reads it.
            "POST /complaints": ["customer"],
            "GET /complaints/[0-9]+": ["customer", "vendor", "nea_officer", "operator"],
            "PUT /complaints/[0-9]+/status": ["operator"],

            //Analytics
            "GET /analytics/revenue/[0-9]+": ["vendor"],
            "GET /analytics/orders/[0-9]+": ["vendor"],
            "GET /analytics/top-items/[0-9]+": ["vendor"],

            // Menu and stall management by the vendor who owns the stall
            "GET /stalls/[0-9]+/manage/menu-items": ["vendor"],
            "POST /stalls/[0-9]+/menu-items": ["vendor"],
            "PUT /stalls/[0-9]+/menu-items/[0-9]+": ["vendor"],
            "PATCH /stalls/[0-9]+/menu-items/[0-9]+/availability": ["vendor"],
            "DELETE /stalls/[0-9]+/menu-items/[0-9]+": ["vendor"],
            "PUT /stalls/[0-9]+": ["vendor"],

            // Rental agreements
            // The hawker centre operator owns the tenancy of its own stalls.
            // A vendor may read the agreement it holds but never change one.
            "GET /rental-agreements": ["vendor", "operator"],
            "GET /rental-agreements/expiring": ["operator"],
            "GET /rental-agreements/[0-9]+": ["vendor", "operator"],
            "POST /rental-agreements": ["operator"],
            "PUT /rental-agreements/[0-9]+/renew": ["operator"],
            "PUT /rental-agreements/[0-9]+/end": ["operator"],

            // Tenancy offers
            // The operator puts terms out and may take them back while they are
            // unanswered. Only the vendor being asked can sign or reject them,
            // which is what stops a rent rise being applied without agreement.
            "GET /agreement-offers": ["vendor", "operator"],
            "PUT /agreement-offers/[0-9]+/sign": ["vendor"],
            "PUT /agreement-offers/[0-9]+/reject": ["vendor"],
            "PUT /agreement-offers/[0-9]+/withdraw": ["operator"],

            // Notifications
            // Every signed in account has an inbox and only ever reaches its
            // own, because the recipient is taken from the token
            "GET /notifications": ["customer", "vendor", "nea_officer", "operator"],
            "GET /notifications/unread-count": ["customer", "vendor", "nea_officer", "operator"],
            "PUT /notifications/read-all": ["customer", "vendor", "nea_officer", "operator"],
            "PUT /notifications/[0-9]+/read": ["customer", "vendor", "nea_officer", "operator"],

            // Replies to customer reviews
            // A vendor answers the reviews of the stall they run. The reply
            // itself is public and is read without a token.
            "GET /vendors/me/reviews": ["vendor"],
            "PUT /reviews/[0-9]+/reply": ["vendor"],
            "DELETE /reviews/[0-9]+/reply": ["vendor"]
        };

        const requestedEndpoint = `${req.method} ${req.path}`;
        const userRole = decoded.role;

        const authorizedRole = Object.entries(authorizedRoles).find(
            ([endpoint, roles]) => {
                const regex = new RegExp(`^${endpoint}$`);
                return regex.test(requestedEndpoint) && roles.includes(userRole);
            }
        );

        if (!authorizedRole) {
            return res.status(403).json({ error: "Forbidden" });
        }

        req.user = decoded;
        next();
    });
}

// Optional Authentication Middleware
// Allows guests to continue without a token,
// but verifies the token when one is provided.
function optionalJWT(req, res, next) {
    const authorizationHeader = req.headers.authorization;

    // No token means the request continues as a guest
    if (!authorizationHeader) {
        req.user = null;
        return next();
    }

    const [scheme, token] = authorizationHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({
            error: "Authorization header must use the Bearer token format",
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
        if (error) {
            return res.status(403).json({
                error: "Invalid or expired authentication token",
            });
        }

        req.user = decoded;
        next();
    });
}

module.exports = {
    verifyJWT,
    optionalJWT,
};