# Singapore Hawker Centre Management System

## Overview

The Singapore Hawker Centre Management System is a full-stack web application developed to modernise the management of hawker centres by providing a single platform for customers, vendors and NEA officers. The system streamlines food ordering, payment processing, stall management, customer feedback and regulatory inspections while improving the overall user experience.

The application follows a RESTful API architecture built with Node.js, Express.js and Microsoft SQL Server. JWT authentication and role-based authorization are implemented to ensure that users can only access features relevant to their assigned roles.

---

## Technology Stack

### Front-End
- HTML5
- CSS3
- JavaScript (ES6)

### Back-End
- Node.js
- Express.js
- RESTful APIs

### Database
- Microsoft SQL Server

### Authentication
- JSON Web Token (JWT)
- bcryptjs

### Validation
- Joi

### API Documentation
- Swagger
- swagger-autogen
- swagger-ui-express

### Testing
- Jest

---

# User Roles

The system supports four different user roles.

- Customer
- Guest Customer
- Vendor
- NEA Officer
- Operator

Each role is granted access only to the functions required for their responsibilities.

---

# Features

## Customer Features

### Browse Food Stalls
Customers can browse available food stalls and view important information before placing an order, including:

- Stall description
- Hawker centre location
- Hygiene grade
- Average menu price
- Stall availability

### Search and Filter Stalls

Customers can quickly locate stalls using multiple filters.

Supported filters include:

- Stall name
- Hawker centre location
- Cuisine
- Hygiene grade
- Average price

### View Stall Menu

Customers can:

- Browse available menu items
- View item descriptions
- View prices
- View food images
- Identify unavailable menu items

---

## Food Ordering

Customers can:

- Add menu items into the shopping cart
- Update item quantities
- Remove items
- View cart subtotal
- Add special instructions
- Review the complete order before checkout

Business rules include:

- One order can only contain food from a single stall.
- Menu prices are validated by the server before an order is created.
- Maximum quantity validation is enforced.
- Invalid requests are rejected.

---

## Checkout

Customers may checkout as either:

- Registered member
- Guest customer

Checkout includes:

- Customer details
- Payment method selection
- Special instructions
- Order summary
- Server-side validation before order creation

---

## Optional Guest Registration

Guest customers may optionally create a customer account during checkout.

After successful registration:

- Guest information is converted into a customer account.
- The completed order is linked to the newly created account.
- Customers can immediately access their order history after signing in.

---

## Payment Processing

Supported payment methods include:

- Cash
- Card
- PayNow

The system supports:

- Transaction reference validation
- Payment status tracking
- Payment creation
- Payment status updates
- Guest payment processing
- Member payment processing

Guest customers may also change their payment method while the order remains pending.

---

## Order Confirmation

After payment is completed, customers receive:

- Order number
- Guest order reference (for guests)
- Payment information
- Order summary
- Current order status

---

## Order History

Registered customers can:

- View Active Orders
- View Previous Orders
- Track order progress
- View ordered items
- View payment information
- View order timeline
- View order details

Only orders belonging to the authenticated customer can be accessed.

---

## Guest Order Tracking

Guest customers can retrieve their orders using:

- Order ID
- Guest Order Reference

Guest customers may:

- Track order progress
- View payment status
- Change payment method (when applicable)
- Cancel eligible pending cash orders

---

## Frequently Ordered Items

The system analyses completed customer orders and recommends the customer's most frequently ordered menu items.

Each recommendation displays:

- Menu item
- Stall
- Number of previous purchases

---

## Customer Feedback

Customers can:

- Submit stall reviews
- Provide ratings
- Leave written feedback

---

## Stall Reviews

Customers may browse reviews submitted by other users and sort them to quickly identify the most relevant feedback.

---

## Vendor Features

Vendors can:

- View incoming customer orders
- Update order status
- Manage food stalls
- View sales analytics
- Monitor customer orders

Order statuses include:

- Pending
- Preparing
- Ready
- Completed
- Cancelled

---

## NEA Officer Features

NEA officers can:

- Submit inspection reports
- Record inspection outcomes
- Monitor hygiene compliance
- Review regulatory information

---

## Security

The application implements multiple security measures, including:

- JWT authentication
- Role-based authorization
- Password hashing using bcrypt
- Server-side validation with Joi
- Input sanitisation
- Ownership validation
- Protected API endpoints

---

## API Documentation

Swagger is integrated into the project to provide interactive REST API documentation.

The documentation includes:

- Available endpoints
- Request parameters
- Request bodies
- Response examples
- Authentication requirements
- HTTP status codes

---

## Unit Testing

Jest is used to verify the behaviour of backend controllers and models.

Unit tests cover:

- Successful requests
- Validation failures
- Authentication scenarios
- Error handling
- Database interaction through mocked dependencies

---

## Error Handling

The API returns meaningful HTTP responses including:

- 200 OK
- 201 Created
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 409 Conflict
- 500 Internal Server Error

---

## Project Structure

```
controllers/
models/
middlewares/
routes/
public/
tests/
swagger.js
swagger-output.json
app.js
package.json
```

---

## Installation

Clone the repository.

```bash
git clone <repository-url>
```

Install dependencies.

```bash
npm install
```

Generate Swagger documentation.

```bash
npm run swagger
```

Start the application.

```bash
npm start
```

Run unit tests.

```bash
npm test
```

Generate code coverage.

```bash
npm run test:coverage
```

---

## Contributors

Team 03

- Pang Wy Zen Mervin
- Rayne Tok
- Louis Ng
- Hun Zen Wae

---

## License

This project was developed for educational purposes as part of the Back-End Development and Software Project Management modules at Ngee Ann Polytechnic.