// User Controller - Handles HTTP requests for User Registration and Login
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const userModel = require("../models/userModel");

// Register a new user account
async function registerUser(req, res) {
    const { Username, Email, Password, Role } = req.body;

    try {
        // Duplicate email check
        const existingEmail = await userModel.getUserByEmail(Email);
        if (existingEmail) {
            return res.status(400).json({ error: "Email is already registered" });
        }

        // Duplicate username check
        const existingUsername = await userModel.getUserByUsername(Username);
        if (existingUsername) {
            return res.status(400).json({ error: "Username is already taken" });
        }

        // Hash the password before storing it using bcryptjs
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(Password, salt);

        // Create the user in the database
        const newUser = await userModel.createUser({
            Username,
            Email,
            PasswordHash: passwordHash,
            Role,
        });

        res.status(201).json({
            message: "User registered successfully",
            user: newUser,
        });
    } catch (error) {
        console.error("Controller error (registerUser):", error);
        res.status(500).json({ error: "Error registering user" });
    }
}

// Login with email and password and returns a JWT on success
async function loginUser(req, res) {
    const { Email, Password } = req.body;

    try {
        // Look the user up by email
        const user = await userModel.getUserByEmail(Email);
        if (!user) {
            // Generic message so attackers can't tell which field was wrong
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // Compare the submitted password with the stored bcrypt hash
        const isMatch = await bcrypt.compare(Password, user.PasswordHash);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // If the credentials are valid it will generate a JWT that expires in 1 hour
        const payload = {
            id: user.UserID,
            username: user.Username,
            email: user.Email,
            role: user.Role,
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: "3600s",
        });

        res.status(200).json({
            message: "Login successful",
            token: token,
        });
    } catch (error) {
        console.error("Controller error (loginUser):", error);
        res.status(500).json({ error: "Error logging in" });
    }
}

module.exports = {
    registerUser,
    loginUser,
};