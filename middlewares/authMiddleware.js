// Authorization Middleware - Verifies JWT tokens and checks user roles 
const jwt = require("jsonwebtoken");

function verifyJWT(req, res, next) {
    const token =
        req.headers.authorization && req.headers.authorization.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: "Forbidden" });
        }

        const authorizedRoles = {
            // Only customers can submit feedback
            "POST /feedback": ["customer"],
            // Only vendors can update order status
            "PUT /orders/[0-9]+/status": ["vendor"],
        };

        const requestedEndpoint = `${req.method} ${req.url}`;
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

module.exports = {
    verifyJWT,
};