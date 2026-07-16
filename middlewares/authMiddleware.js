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

            // Orders
            "GET /orders": ["customer", "vendor", "nea_officer"],
            "GET /orders/[0-9]+": ["customer", "vendor", "nea_officer"],
            "POST /orders": ["customer"],
            "DELETE /orders/[0-9]+": ["customer"],

            // Payments
            "GET /payments": ["customer", "vendor"],
            "GET /payments/[0-9]+": ["customer", "vendor"],
            "GET /payments/order/[0-9]+": ["customer", "vendor"],
            "PUT /payments/[0-9]+/status": ["vendor"],
            "DELETE /payments/[0-9]+": ["customer"],

            // Inspections
            "POST /inspections": ["nea_officer"],
            "GET /inspections/[0-9]+": ["customer", "vendor", "nea_officer"],

            // Complaints
            "POST /complaints": ["customer"],
            "GET /complaints/[0-9]+": ["customer", "vendor", "nea_officer"],
            "PUT /complaints/[0-9]+/status": ["vendor", "nea_officer"],
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