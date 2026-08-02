# Team03_BED_Assignment
Back-End Development Group Project for a Singapore Hawker Centre Management System built with Node.js, Express, RESTful APIs, and Microsoft SQL Server. (Mervin, Rayne, &amp; Louis)

# Team03_BED_Assignment
Back-End Development group project for a Singapore Hawker Centre Management System using Node.js, Express, RESTful APIs, and Microsoft SQL Server. (Louis, Mervin, & Rayne)


S10268761B - Louis Ng Bo Lin

1. User Registration (POST /register)
Purpose: Allows a new user to create an account

Files
- controllers/userController.js
- models/userModel.js
- middlewares/userValidation.js

Features
- Collects username, email, password, and role
- Validates all inputs using Joi with descriptive error messages
- Checks for duplicate email and username before creating the account
- Hashes the password using bcryptjs before saving it to the database
- Supports customer, vendor, nea_officer and admin roles


2. User Login (POST /login)
Purpose: Allows a user to log into the system

Files
- controllers/userController.js
- models/userModel.js
- middlewares/userValidation.js

Features
- Verifies the submitted password against the stored bcrypt hash
- Generates a JWT containing the user's id, email and role on success
- Returns a generic error message for invalid credentials to prevent account enumeration
- Token expires after one hour


3. Authentication Middleware
Purpose: Protects routes and enforces role-based access

Files
- middlewares/authMiddleware.js

Features
- Verifies the JWT and rejects requests with a missing or invalid token
- Checks the user's role against an authorized roles map for each endpoint
- Allows guest access to public routes such as viewing reviews
- Used by the whole team to secure their protected routes


4. Submit Feedback for a Food Stall (POST/PUT/DELETE /feedback)
Purpose: Allows authenticated customers to manage their reviews

Files
- controllers/feedbackController.js
- models/feedbackModel.js
- middlewares/feedbackValidation.js

Features
- Customers can create, update and delete their own reviews
- Validates rating (1–5) and comment length using Joi
- Verifies the food stall exists before accepting a review
- Ownership check so customers can only edit or delete their own reviews (403 otherwise)
- Takes the user identity from the JWT, not the request body


5. Sort and View Stall Reviews (GET /feedback/stall/:stallId)
Purpose: Displays all reviews for a stall

Files
- controllers/feedbackController.js
- models/feedbackModel.js

Features
- Public endpoint, accessible to guests without logging in
- Sorts reviews by newest, oldest, highest or lowest rating
- Returns the stall's average rating and total review count
- Uses a whitelist of sort options to prevent SQL injection
- Joins the UserAccount table to display reviewer usernames


6. Front-End Pages
Purpose: Connect the user account features to a web interface

Files
- public/sign-in.html, public/sign-up.html, public/success.html
- public/profile.html, public/reviews.html
- public/sign-up-in.js, public/profile.js, public/reviews.js

Features
- Sign up and sign in pages that call the register and login APIs
- Stores the JWT and redirects the user after login
- Guest button allows browsing without an account
- Profile page displays the logged-in user's details from the JWT
- Reviews page with a sort dropdown and review submission for customers



S10275479D - Pang Wy Zen Mervin

1. Place Food Order (POST/GET/DELETE /orders)
Purpose: Allows customers to place and manage food orders from a stall

Files
- controllers/orderController.js
- models/orderModel.js
- middlewares/orderValidation.js

Features
- Customers can select menu items and place an order from a stall
- Validates the order details and quantities using Joi
- Calculates the subtotal for the selected items
- Retrieves a customer's orders and order details
- Supports guest ordering without an account


2. Checkout and Payment (POST/GET/PUT /payments)
Purpose: Handles payment for placed orders

Files
- controllers/paymentController.js
- models/paymentModel.js
- middlewares/paymentValidation.js

Features
- Customers can pay for an order using Cash, Card or PayNow
- Validates the payment amount against the order total before processing
- Updates the payment status of an order
- Vendors can confirm cash payments made at the stall
- Restricts payment records so customers only access their own


3. View Order History (GET /order-history)
Purpose: Displays a customer's past and active orders

Files
- controllers/orderHistoryController.js
- models/orderModel.js

Features
- Displays a customer's active and completed orders
- Shows order details, items and payment status
- Displays the customer's most frequently ordered menu items
- Restricted to the authenticated customer's own orders



S10271003J - Rayne Tok (Zhuo Qihong)

1. NEA Inspection Report Submission (POST/GET /inspections)
Purpose: Allows NEA officers to submit and view stall inspection reports

Files
- controllers/inspectionController.js
- models/inspectionModel.js
- middlewares/inspectionValidation.js

Features
- NEA officers can submit inspection reports with a hygiene grade
- Validates the inspection details using Joi
- Retrieves the inspection history for a stall
- Restricted to the nea_officer role using the authorization middleware


2. Customer Complaint Submission (POST/GET/PUT /complaints)
Purpose: Allows customers to submit complaints about stalls

Files
- controllers/complaintController.js
- models/complaintModel.js
- middlewares/complaintValidation.js

Features
- Customers can submit complaints about a food stall
- Validates the complaint details using Joi
- Vendors and NEA officers can view and update the status of complaints
- Handles default complaint status on submission
- Enforces role-based access for viewing and updating complaints


3. Vendor Sales Analytics (GET /analytics)
Purpose: Provides vendors with sales performance for their stall

Files
- controllers/analyticsController.js
- models/analyticsModel.js
- middlewares/analyticsValidation.js

Features
- Displays revenue, order volume and top-selling items for a stall
- Uses SQL aggregation with SUM, COUNT, GROUP BY and JOIN
- Displays best-selling menu items and revenue generated per item
- Restricted to vendors, with a stall ownership check so vendors only view their own stall


Technologies Used
- Node.js
- Express
- Microsoft SQL Server (mssql)
- bcryptjs (password hashing)
- jsonwebtoken (JWT authentication)
- Joi (input validation)