------------------------------------------------------------
-- Create and Use Database
------------------------------------------------------------
CREATE DATABASE HawkerManagementDB;
GO

USE HawkerManagementDB;
GO

------------------------------------------------------------
-- Users Table
-- Stores all system users.
-- Supports Customer, Vendor and NEA Officer roles.
------------------------------------------------------------
CREATE TABLE Users (
    user_id         INT                 IDENTITY(1,1)   PRIMARY KEY,
    username        NVARCHAR(50)        NOT NULL        UNIQUE,
    email           NVARCHAR(100)       NOT NULL        UNIQUE,
    password_hash   NVARCHAR(255)       NOT NULL,
    role            NVARCHAR(20)        NOT NULL
        CHECK (role IN ('customer', 'vendor', 'nea_officer')),
    created_at      DATETIME            DEFAULT GETDATE()
);

------------------------------------------------------------
-- Stalls Table
-- Stores hawker stall information displayed on the home page.
------------------------------------------------------------
CREATE TABLE Stalls (
    stall_id        INT                 IDENTITY(1,1)   PRIMARY KEY,
    stall_name      NVARCHAR(100)       NOT NULL,
    cuisine_type    NVARCHAR(50)        NOT NULL,
    description     NVARCHAR(255),
    image_url       NVARCHAR(255),
    is_active       BIT                 NOT NULL    DEFAULT 1,
    created_at      DATETIME            DEFAULT GETDATE()
);

------------------------------------------------------------
-- MenuItems Table
-- Stores food menu items for each stall.
-- Supports vendor add / edit menu feature and ordering flow.
------------------------------------------------------------
CREATE TABLE MenuItems (
    menu_item_id    INT                 IDENTITY(1,1)   PRIMARY KEY,
    stall_id        INT                 NOT NULL,
    item_name       NVARCHAR(100)       NOT NULL,
    description     NVARCHAR(255),
    price           DECIMAL(10,2)       NOT NULL
        CHECK (price >= 0),
    category        NVARCHAR(50),
    image_url       NVARCHAR(255),
    is_available    BIT                 NOT NULL    DEFAULT 1,
    created_at      DATETIME            DEFAULT GETDATE(),

    CONSTRAINT FK_MenuItems_Stalls
    FOREIGN KEY (stall_id) REFERENCES Stalls(stall_id)
);

------------------------------------------------------------
-- Orders Table
-- Stores all customer and guest orders.
-- Supports Place Food Order and Order History.
------------------------------------------------------------
CREATE TABLE Orders (
    order_id                INT                 IDENTITY(1,1)   PRIMARY KEY,
    user_id                 INT                 NULL,
    guest_name              NVARCHAR(100)       NULL,
    guest_email             NVARCHAR(100)       NULL,
    order_status            NVARCHAR(30)        NOT NULL    DEFAULT 'Pending'
        CHECK (order_status IN ('Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled')),
    order_type              NVARCHAR(20)        NOT NULL
        CHECK (order_type IN ('Guest', 'Member')),
    total_amount            DECIMAL(10,2)       NOT NULL    DEFAULT 0
        CHECK (total_amount >= 0),
    special_instructions    NVARCHAR(255)       NULL,
    created_at              DATETIME            DEFAULT GETDATE(),
    updated_at              DATETIME            DEFAULT GETDATE(),

    CONSTRAINT FK_Orders_Users
    FOREIGN KEY (user_id)   REFERENCES Users(user_id),

    CONSTRAINT CK_Orders_UserType
    CHECK (
        (order_type = 'Member' AND user_id IS NOT NULL)
        OR
        (order_type = 'Guest' AND user_id IS NULL AND guest_name IS NOT NULL AND guest_email IS NOT NULL)
    )
);

------------------------------------------------------------
-- OrderItems Table
-- Stores food items inside each order.
-- One order can contain many order items.
------------------------------------------------------------
CREATE TABLE OrderItems (
    order_item_id   INT                 IDENTITY(1,1)   PRIMARY KEY,
    order_id        INT                 NOT NULL,
    menu_item_id    INT                 NOT NULL,
    quantity        INT                 NOT NULL
        CHECK (quantity > 0),
    unit_price      DECIMAL(10,2)       NOT NULL
        CHECK (unit_price >= 0),
    subtotal AS (quantity * unit_price) PERSISTED,

    CONSTRAINT FK_OrderItems_Orders
    FOREIGN KEY (order_id) REFERENCES Orders(order_id)
    ON DELETE CASCADE,

    CONSTRAINT FK_OrderItems_MenuItems
    FOREIGN KEY (menu_item_id) REFERENCES MenuItems(menu_item_id)
);

------------------------------------------------------------
-- Payments Table
-- Stores payment details for each order.
-- Supports Checkout and Payment.
------------------------------------------------------------
CREATE TABLE Payments (
    payment_id              INT                 IDENTITY(1,1)   PRIMARY KEY,
    order_id                INT                 NOT NULL        UNIQUE,
    payment_method          NVARCHAR(30)        NOT NULL
        CHECK (payment_method IN ('Card', 'PayNow', 'Cash')),
    payment_status          NVARCHAR(30)        NOT NULL        DEFAULT 'Pending'
        CHECK (payment_status IN ('Pending', 'Successful', 'Failed', 'Refunded')),
    amount                  DECIMAL(10,2)       NOT NULL
        CHECK (amount >= 0),
    transaction_reference   NVARCHAR(100) NOT NULL UNIQUE,
    paid_at                 DATETIME            NULL,
    created_at              DATETIME            DEFAULT GETDATE(),

    CONSTRAINT FK_Payments_Orders
    FOREIGN KEY (order_id)  REFERENCES Orders(order_id)
);

------------------------------------------------------------
-- Reviews Table
-- Stores customer reviews and ratings for stalls.
------------------------------------------------------------
CREATE TABLE Reviews (
    review_id               INT             IDENTITY(1,1)   PRIMARY KEY,
    user_id                 INT             NOT NULL,
    stall_id                INT             NOT NULL,
    rating                  INT             NOT NULL
        CHECK (rating BETWEEN 1 AND 5),
    comment                 NVARCHAR(500),
    created_at              DATETIME        NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Reviews_Users
    FOREIGN KEY (user_id)   REFERENCES Users(user_id),

    CONSTRAINT FK_Reviews_Stalls
    FOREIGN KEY (stall_id)  REFERENCES Stalls(stall_id)
);

------------------------------------------------------------
-- Complaints Table
-- Stores customer complaints for NEA/operator follow-up.
------------------------------------------------------------
CREATE TABLE Complaints (
    complaint_id            INT             IDENTITY(1,1)   PRIMARY KEY,
    user_id                 INT             NOT NULL,
    stall_id                INT             NOT NULL,
    complaint_title         NVARCHAR(100)   NOT NULL,
    complaint_description   NVARCHAR(500)   NOT NULL,
    complaint_status        NVARCHAR(30)    NOT NULL        DEFAULT 'Pending'
        CHECK (complaint_status IN ('Pending', 'In Review', 'Resolved')),
    created_at              DATETIME        NOT NULL        DEFAULT GETDATE(),
    resolved_at             DATETIME        NULL,

    CONSTRAINT FK_Complaints_Users
    FOREIGN KEY (user_id) REFERENCES Users(user_id),

    CONSTRAINT FK_Complaints_Stalls
    FOREIGN KEY (stall_id) REFERENCES Stalls(stall_id)
);

------------------------------------------------------------
-- InspectionReports Table
-- Stores NEA inspection records for stalls.
------------------------------------------------------------
CREATE TABLE InspectionReports (
    inspection_id           INT             IDENTITY(1,1)   PRIMARY KEY,
    officer_id              INT             NOT NULL,
    stall_id                INT             NOT NULL,
    hygiene_grade           NVARCHAR(5)     NOT NULL
        CHECK (hygiene_grade IN ('A', 'B', 'C', 'D')),
    inspection_notes        NVARCHAR(500),
    inspection_status       NVARCHAR(30)    NOT NULL        DEFAULT 'Submitted'
        CHECK (inspection_status IN ('Submitted', 'Reviewed', 'Follow-up Required')),
    inspection_date         DATETIME        NOT NULL        DEFAULT GETDATE(),

    CONSTRAINT FK_InspectionReports_Users
    FOREIGN KEY (officer_id)    REFERENCES Users(user_id),

    CONSTRAINT FK_InspectionReports_Stalls
    FOREIGN KEY (stall_id)      REFERENCES Stalls(stall_id)
);