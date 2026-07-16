/* Name: Mervin, Rayne, Louis */
/* Team: Team 03 */
/* Back-End Development Assignment */

------------------------------------------------------------
-- Create and Use Database (HawkerManagementDB)
------------------------------------------------------------
CREATE DATABASE HawkerManagementDB;
GO

USE HawkerManagementDB;
GO

/* Table: Users */
CREATE TABLE UserAccount
(
    UserID          INT IDENTITY(1,1)       NOT NULL,
    Username        VARCHAR(50)             NOT NULL,
    Email           VARCHAR(100)            NOT NULL,
    PasswordHash    VARCHAR(255)            NOT NULL,
    Role            VARCHAR(20)             NOT NULL,
    CreatedAt       DATETIME                NOT NULL DEFAULT GETDATE(),

    CONSTRAINT      PK_UserAccount          PRIMARY KEY (UserID),
    CONSTRAINT      UQ_UserAccount_Username UNIQUE (Username),
    CONSTRAINT      UQ_UserAccount_Email    UNIQUE (Email),
    CONSTRAINT      CHK_UserAccount_Role    CHECK (Role IN ('customer', 'vendor', 'nea_officer'))
);

/* Table: Operator */
CREATE TABLE Operator
(
    OperatorID      INT IDENTITY(1,1)       NOT NULL,
    OperatorName    VARCHAR(80)             NOT NULL,
    ContactPerson   VARCHAR(80)             NOT NULL,
    ContactNo       VARCHAR(15)             NULL,

    CONSTRAINT      PK_Operator             PRIMARY KEY (OperatorID)
);

/* Table: HawkerCentre */
CREATE TABLE HawkerCentre
(
    HawkerCentreID  INT IDENTITY(1,1)       NOT NULL,
    HCName          VARCHAR(80)             NOT NULL,
    HCAddress       VARCHAR(150)            NOT NULL,
    OperatorID      INT                     NOT NULL,

    CONSTRAINT      PK_HawkerCentre         PRIMARY KEY (HawkerCentreID),
    CONSTRAINT      FK_HawkerCentre_Operator
        FOREIGN KEY (OperatorID) REFERENCES Operator(OperatorID)
);

/* Table: FoodStall */
CREATE TABLE FoodStall
(
    StallID         INT IDENTITY(1,1)       NOT NULL,
    VendorUserID    INT                     NULL,
    StallUnitNo     VARCHAR(10)             NOT NULL,
    StallName       VARCHAR(80)             NOT NULL,
    StallDesc       VARCHAR(300)            NULL,
    StallImage      VARCHAR(255)            NULL,
    IsActive        BIT                     NOT NULL DEFAULT 1,
    HawkerCentreID  INT                     NOT NULL,

    CONSTRAINT      PK_FoodStall            PRIMARY KEY (StallID),
    CONSTRAINT      FK_FoodStall_UserAccount
        FOREIGN KEY (VendorUserID) REFERENCES UserAccount(UserID),
    CONSTRAINT FK_FoodStall_HawkerCentre
        FOREIGN KEY (HawkerCentreID) REFERENCES HawkerCentre(HawkerCentreID)
);

/* Table: Cuisine */
CREATE TABLE Cuisine
(
    CuisineID       INT IDENTITY(1,1)       NOT NULL,
    CuisineName     VARCHAR(50)             NOT NULL,
    CuisineDesc     VARCHAR(300)            NULL,

    CONSTRAINT      PK_Cuisine              PRIMARY KEY (CuisineID),
    CONSTRAINT      UQ_Cuisine_CuisineName  UNIQUE (CuisineName)
);

/* Table: MenuItem */
CREATE TABLE MenuItem
(
    MenuItemID      INT IDENTITY(1,1)       NOT NULL,
    StallID         INT                     NOT NULL,
    ItemName        VARCHAR(100)            NOT NULL,
    ItemDesc        VARCHAR(300)            NULL,
    ItemPrice       DECIMAL(6,2)            NOT NULL,
    ItemCategory    VARCHAR(40)             NOT NULL,
    ItemImage       VARCHAR(255)            NULL,
    IsAvailable     BIT                     NOT NULL DEFAULT 1,
    CreatedAt       DATETIME                NOT NULL DEFAULT GETDATE(),

    CONSTRAINT      PK_MenuItem             PRIMARY KEY (MenuItemID),
    CONSTRAINT      FK_MenuItem_FoodStall
        FOREIGN KEY (StallID) REFERENCES FoodStall(StallID),
    CONSTRAINT      CHK_MenuItem_ItemPrice  CHECK (ItemPrice >= 0.01)
);

/* Table: MenuItemCuisine */
CREATE TABLE MenuItemCuisine
(
    MenuItemID      INT                     NOT NULL,
    CuisineID       INT                     NOT NULL,

    CONSTRAINT      PK_MenuItemCuisine      PRIMARY KEY (MenuItemID, CuisineID),
    CONSTRAINT      FK_MenuItemCuisine_MenuItem
        FOREIGN KEY (MenuItemID) REFERENCES MenuItem(MenuItemID),
    CONSTRAINT      FK_MenuItemCuisine_Cuisine
        FOREIGN KEY (CuisineID) REFERENCES Cuisine(CuisineID)
);

/* Table: CustomerOrder */
CREATE TABLE CustomerOrder
(
    OrderID              INT IDENTITY(1,1)  NOT NULL,
    UserID               INT                NULL,
    GuestName            VARCHAR(80)        NULL,
    GuestEmail           VARCHAR(100)       NULL,
    GuestOrderReference  VARCHAR(50)        NULL,
    OrderType            VARCHAR(20)        NOT NULL,
    OrderStatus          VARCHAR(30)        NOT NULL DEFAULT 'Pending',
    TotalAmount          DECIMAL(8,2)       NOT NULL DEFAULT 0,
    SpecialInstructions  VARCHAR(300)       NULL,
    OrderDateTime        DATETIME           NOT NULL DEFAULT GETDATE(),
    UpdatedAt            DATETIME           NOT NULL DEFAULT GETDATE(),

    CONSTRAINT          PK_CustomerOrder    PRIMARY KEY (OrderID),
    CONSTRAINT          FK_CustomerOrder_UserAccount
        FOREIGN KEY (UserID) REFERENCES UserAccount(UserID),
    CONSTRAINT          CHK_CustomerOrder_OrderType
        CHECK (OrderType IN ('Guest', 'Member')),
    CONSTRAINT          CHK_CustomerOrder_OrderStatus
        CHECK (OrderStatus IN ('Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled')),
    CONSTRAINT          CHK_CustomerOrder_TotalAmount
        CHECK (TotalAmount >= 0),
    CONSTRAINT          CHK_CustomerOrder_GuestOrMember
        CHECK (
            (OrderType = 'Member' AND UserID IS NOT NULL AND GuestName IS NULL AND GuestEmail IS NULL AND GuestOrderReference IS NULL)
            OR
            (OrderType = 'Guest' AND UserID IS NULL AND GuestName IS NOT NULL AND GuestEmail IS NOT NULL AND GuestOrderReference IS NOT NULL)
        )
);

/* Ensure each guest order reference is unique */
CREATE UNIQUE INDEX UX_CustomerOrder_GuestOrderReference
ON CustomerOrder(GuestOrderReference)
WHERE GuestOrderReference IS NOT NULL;

/* Table: OrderStatusHistory */
CREATE TABLE OrderStatusHistory
(
    OrderStatusHistoryID INT IDENTITY(1,1)      NOT NULL,
    OrderID              INT                    NOT NULL,
    OrderStatus          VARCHAR(30)            NOT NULL,
    StatusDateTime       DATETIME               NOT NULL DEFAULT GETDATE(),
    UpdatedByUserID      INT                    NULL,

    CONSTRAINT           PK_OrderStatusHistory  PRIMARY KEY (OrderStatusHistoryID),
    CONSTRAINT           FK_OrderStatusHistory_CustomerOrder
        FOREIGN KEY (OrderID) REFERENCES CustomerOrder(OrderID) ON DELETE CASCADE,
    CONSTRAINT           FK_OrderStatusHistory_UserAccount
        FOREIGN KEY (UpdatedByUserID) REFERENCES UserAccount(UserID),
    CONSTRAINT           CHK_OrderStatusHistory_Status
        CHECK (OrderStatus IN ('Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'))
);

CREATE INDEX IX_OrderStatusHistory_OrderID_StatusDateTime
ON OrderStatusHistory(OrderID, StatusDateTime);

/* Table: OrderItem */
CREATE TABLE OrderItem
(
    OrderItemID         INT IDENTITY(1,1)       NOT NULL,
    OrderID             INT                     NOT NULL,
    MenuItemID          INT                     NOT NULL,
    Quantity            INT                     NOT NULL,
    UnitPrice           DECIMAL(6,2)            NOT NULL,
    Subtotal            AS (Quantity * UnitPrice) PERSISTED,

    CONSTRAINT          PK_OrderItem            PRIMARY KEY (OrderItemID),
    CONSTRAINT          FK_OrderItem_CustomerOrder
        FOREIGN KEY (OrderID) REFERENCES CustomerOrder(OrderID)
        ON DELETE CASCADE,
    CONSTRAINT          FK_OrderItem_MenuItem
        FOREIGN KEY (MenuItemID) REFERENCES MenuItem(MenuItemID),
    CONSTRAINT          CHK_OrderItem_Quantity  CHECK (Quantity >= 1),
    CONSTRAINT          CHK_OrderItem_UnitPrice CHECK (UnitPrice >= 0.01)
);

/* Table: Payment */
CREATE TABLE Payment
(
    PaymentID              INT IDENTITY(1,1)               NOT NULL,
    OrderID                INT                             NOT NULL,
    PaymentMethod          VARCHAR(30)                     NOT NULL,
    PaymentStatus          VARCHAR(30)                     NOT NULL DEFAULT 'Pending',
    Amount                 DECIMAL(8,2)                    NOT NULL,
    TransactionReference   VARCHAR(100)                    NULL,
    PaidAt                 DATETIME                        NULL,
    CreatedAt              DATETIME                        NOT NULL DEFAULT GETDATE(),

    CONSTRAINT             PK_Payment                      PRIMARY KEY (PaymentID),
    CONSTRAINT             UQ_Payment_OrderID              UNIQUE (OrderID),
    CONSTRAINT             UQ_Payment_TransactionReference UNIQUE (TransactionReference),
    CONSTRAINT             FK_Payment_CustomerOrder
        FOREIGN KEY (OrderID) REFERENCES CustomerOrder(OrderID),
    CONSTRAINT             CHK_Payment_Method
        CHECK (PaymentMethod IN ('Cash', 'Card', 'PayNow')),
    CONSTRAINT             CHK_Payment_Status
        CHECK (PaymentStatus IN ('Pending', 'Successful', 'Failed', 'Refunded')),
    CONSTRAINT             CHK_Payment_Amount
        CHECK (Amount >= 0)
);

/* Ensure non-null payment references are unique */
CREATE UNIQUE INDEX UX_Payment_TransactionReference
ON Payment(TransactionReference)
WHERE TransactionReference IS NOT NULL;

/* Table: Review */
CREATE TABLE Review
(
    ReviewID        INT IDENTITY(1,1)       NOT NULL,
    UserID          INT                     NOT NULL,
    StallID         INT                     NOT NULL,
    Rating          INT                     NOT NULL,
    ReviewComment   VARCHAR(500)            NULL,
    ReviewDateTime  DATETIME                NOT NULL DEFAULT GETDATE(),

    CONSTRAINT      PK_Review               PRIMARY KEY (ReviewID),
    CONSTRAINT      FK_Review_UserAccount
        FOREIGN KEY (UserID) REFERENCES UserAccount(UserID),
    CONSTRAINT      FK_Review_FoodStall
        FOREIGN KEY (StallID) REFERENCES FoodStall(StallID),
    CONSTRAINT      CHK_Review_Rating       CHECK (Rating BETWEEN 1 AND 5)
);

/* Table: Complaint */
CREATE TABLE Complaint
(
    ComplaintID          INT IDENTITY(1,1) NOT NULL,
    UserID               INT               NOT NULL,
    StallID              INT               NOT NULL,
    ComplaintTitle       VARCHAR(100)      NOT NULL,
    ComplaintDesc        VARCHAR(500)      NOT NULL,
    ComplaintStatus      VARCHAR(30)       NOT NULL DEFAULT 'Pending',
    CreatedAt            DATETIME          NOT NULL DEFAULT GETDATE(),
    ResolvedAt           DATETIME          NULL,

    CONSTRAINT           PK_Complaint      PRIMARY KEY (ComplaintID),
    CONSTRAINT           FK_Complaint_UserAccount
        FOREIGN KEY (UserID) REFERENCES UserAccount(UserID),
    CONSTRAINT           FK_Complaint_FoodStall
        FOREIGN KEY (StallID) REFERENCES FoodStall(StallID),
    CONSTRAINT           CHK_Complaint_Status
        CHECK (ComplaintStatus IN ('Pending', 'In Review', 'Resolved'))
);

/* Table: Inspection */
CREATE TABLE Inspection
(
    InspectionID      INT IDENTITY(1,1) NOT NULL,
    OfficerUserID     INT               NOT NULL,
    StallID           INT               NOT NULL,
    InspectionDate    DATETIME          NOT NULL DEFAULT GETDATE(),
    HygieneGrade      CHAR(1)           NOT NULL,
    InspectionStatus  VARCHAR(30)       NOT NULL DEFAULT 'Submitted',

    CONSTRAINT        PK_Inspection     PRIMARY KEY (InspectionID),
    CONSTRAINT        FK_Inspection_UserAccount
        FOREIGN KEY (OfficerUserID) REFERENCES UserAccount(UserID),
    CONSTRAINT        FK_Inspection_FoodStall
        FOREIGN KEY (StallID) REFERENCES FoodStall(StallID),
    CONSTRAINT        CHK_Inspection_HygieneGrade
        CHECK (HygieneGrade IN ('A','B','C','D')),
    CONSTRAINT        CHK_Inspection_Status
        CHECK (InspectionStatus IN ('Submitted', 'Reviewed', 'Follow-up Required'))
);

/* Table: InspectionRemark */
CREATE TABLE InspectionRemark
(
    InspectionRemarkID  INT IDENTITY(1,1)   NOT NULL,
    InspectionID        INT                 NOT NULL,
    RemarkText          VARCHAR(500)        NOT NULL,

    CONSTRAINT          PK_InspectionRemark PRIMARY KEY (InspectionRemarkID),
    CONSTRAINT          FK_InspectionRemark_Inspection
        FOREIGN KEY (InspectionID) REFERENCES Inspection(InspectionID)
        ON DELETE CASCADE
);

/* Table: RentalAgreement */
CREATE TABLE RentalAgreement
(
    AgreementID       INT IDENTITY(1,1)     NOT NULL,
    StallID           INT                   NOT NULL,
    VendorUserID      INT                   NOT NULL,
    StartDate         DATE                  NOT NULL,
    EndDate           DATE                  NOT NULL,
    RentalPrice       DECIMAL(8,2)          NOT NULL,
    TermCondition     VARCHAR(800)          NULL,

    CONSTRAINT        PK_RentalAgreement    PRIMARY KEY (AgreementID),
    CONSTRAINT        FK_RentalAgreement_FoodStall
        FOREIGN KEY (StallID) REFERENCES FoodStall(StallID),
    CONSTRAINT        FK_RentalAgreement_UserAccount
        FOREIGN KEY (VendorUserID) REFERENCES UserAccount(UserID),
    CONSTRAINT        CHK_RentalAgreement_EndDate
        CHECK (EndDate >= StartDate),
    CONSTRAINT        CHK_RentalAgreement_RentalPrice
        CHECK (RentalPrice >= 0.01)
);

------------------------------------------------------------
-- Insert Sample Data (HawkerManagementDB)
------------------------------------------------------------
INSERT INTO UserAccount (Username, Email, PasswordHash, Role)
VALUES
('mervin_customer', 'mervin.customer@example.com', 'hashedpassword123', 'customer'),
('leris_customer', 'customer.two@example.com', 'hashedpassword123', 'customer'),
('louis_vendor', 'rayne.vendor@example.com', 'hashedpassword123', 'vendor'),
('rayne_nea', 'louis.nea@example.com', 'hashedpassword123', 'nea_officer');

INSERT INTO Operator (OperatorName, ContactPerson, ContactNo)
VALUES
('Pang Food Operations', 'Adrian Chua', '81234567'),
('Singapore Hawker Group', 'Benjamin Koh', '82345678');

INSERT INTO HawkerCentre (HCName, HCAddress, OperatorID)
VALUES
('Beauty World Food Centre', '144 Upper Bukit Timah Road, Singapore 588177', 1),
('Maxwell Food Centre', '1 Kadayanallur Street, Singapore 069184', 2);

INSERT INTO FoodStall (VendorUserID, StallUnitNo, StallName, StallDesc, StallImage, IsActive, HawkerCentreID)
VALUES
(3, '#01-01', 'Ah Tan Chicken Rice', 'Popular chicken rice stall serving steamed and roasted chicken rice.', 'chickenrice.jpg', 1, 1),
(3, '#01-02', 'Muthu Prata House', 'Prata stall selling crispy prata and curry dishes.', 'prata.jpg', 1, 1),
(3, '#02-01', 'Selera Nasi Lemak', 'Traditional nasi lemak with chicken wing and sambal.', 'nasilemak.jpg', 1, 2);

INSERT INTO Cuisine (CuisineName, CuisineDesc)
VALUES
('Chinese', 'Chinese hawker dishes'),
('Indian', 'Indian hawker dishes'),
('Malay', 'Malay hawker dishes'),
('Drinks', 'Beverages and desserts');

INSERT INTO MenuItem (StallID, ItemName, ItemDesc, ItemPrice, ItemCategory, ItemImage, IsAvailable)
VALUES
(1, 'Chicken Rice', 'Steamed chicken rice with chilli sauce.', 4.50, 'Main Dish', 'chickenrice.jpg', 1),
(1, 'Roasted Chicken Rice', 'Roasted chicken served with fragrant rice.', 5.00, 'Main Dish', 'roastedchickenrice.jpg', 1),
(1, 'Chicken Soup', 'Warm chicken soup served as a side.', 1.20, 'Side', 'chickensoup.jpg', 1),
(2, 'Plain Prata', 'Crispy plain prata with curry.', 1.50, 'Main Dish', 'plainprata.jpg', 1),
(2, 'Egg Prata', 'Prata with egg served with curry.', 2.20, 'Main Dish', 'eggprata.jpg', 1),
(3, 'Nasi Lemak Chicken Wing', 'Nasi lemak with fried chicken wing, egg and sambal.', 4.80, 'Main Dish', 'nasilemak.jpg', 1),
(3, 'Iced Milo', 'Cold Milo drink.', 1.80, 'Drink', 'icedmilo.jpg', 1);

INSERT INTO MenuItemCuisine (MenuItemID, CuisineID)
VALUES
(1, 1),
(2, 1),
(3, 1),
(4, 2),
(5, 2),
(6, 3),
(7, 4);

INSERT INTO CustomerOrder (UserID, GuestName, GuestEmail, GuestOrderReference, OrderType, OrderStatus, TotalAmount, SpecialInstructions)
VALUES
(1, NULL, NULL, NULL, 'Member', 'Pending', 9.50, 'Less chilli please'),
(NULL, 'Guest Customer', 'guest.customer@example.com', 'GUEST-SAMPLE-ORDER-0002', 'Guest', 'Preparing', 6.80, 'Takeaway order'),
(1, NULL, NULL, NULL, 'Member', 'Completed', 4.80, NULL);

INSERT INTO OrderStatusHistory (OrderID, OrderStatus, StatusDateTime, UpdatedByUserID)
VALUES
(1, 'Pending', DATEADD(MINUTE, -20, GETDATE()), 1),
(2, 'Pending', DATEADD(MINUTE, -35, GETDATE()), NULL),
(2, 'Preparing', DATEADD(MINUTE, -15, GETDATE()), 3),
(3, 'Pending', DATEADD(HOUR, -2, GETDATE()), 1),
(3, 'Preparing', DATEADD(MINUTE, -100, GETDATE()), 3),
(3, 'Ready', DATEADD(MINUTE, -70, GETDATE()), 3),
(3, 'Completed', DATEADD(MINUTE, -60, GETDATE()), 3);

INSERT INTO OrderItem (OrderID, MenuItemID, Quantity, UnitPrice)
VALUES
(1, 1, 1, 4.50),
(1, 2, 1, 5.00),
(2, 4, 2, 1.50),
(2, 5, 1, 2.20),
(2, 7, 1, 1.80),
(3, 6, 1, 4.80);

INSERT INTO Payment (OrderID, PaymentMethod, PaymentStatus, Amount, TransactionReference, PaidAt)
VALUES
(1, 'PayNow', 'Successful', 9.50, 'PAYNOW-ORDER-0001', GETDATE()),
(2, 'Cash', 'Pending', 6.80, 'CASH-ORDER-0002', NULL),
(3, 'Card', 'Successful', 4.80, 'CARD-ORDER-0003', GETDATE());

INSERT INTO Review (UserID, StallID, Rating, ReviewComment)
VALUES
(1, 1, 5, 'Chicken rice was delicious and affordable.'),
(2, 2, 4, 'Prata was crispy and served quickly.'),
(1, 3, 5, 'Nasi lemak was tasty and filling.');

INSERT INTO Complaint (UserID, StallID, ComplaintTitle, ComplaintDesc, ComplaintStatus)
VALUES
(2, 1, 'Long waiting time', 'The waiting time was longer than expected during lunch hour.', 'Pending'),
(1, 2, 'Wrong order received', 'I ordered egg prata but received plain prata.', 'In Review');

INSERT INTO Inspection (OfficerUserID, StallID, HygieneGrade, InspectionStatus)
VALUES
(4, 1, 'A', 'Submitted'),
(4, 2, 'B', 'Follow-up Required'),
(4, 3, 'A', 'Reviewed');

INSERT INTO InspectionRemark (InspectionID, RemarkText)
VALUES
(1, 'Stall is clean and food handling practices are good.'),
(2, 'Minor cleanliness improvements required near preparation area.'),
(3, 'Good hygiene standards observed.');

INSERT INTO RentalAgreement (StallID, VendorUserID, StartDate, EndDate, RentalPrice, TermCondition)
VALUES
(1, 3, '2026-01-01', '2026-12-31', 1200.00, 'Monthly rental agreement for stall operations.'),
(2, 3, '2026-01-01', '2026-12-31', 1100.00, 'Vendor must comply with hygiene requirements.');

------------------------------------------------------------
-- Verification Queries (HawkerManagementDB)
------------------------------------------------------------
SELECT * FROM UserAccount;
SELECT * FROM HawkerCentre;
SELECT * FROM FoodStall;
SELECT * FROM Cuisine;
SELECT * FROM MenuItem;
SELECT * FROM CustomerOrder;
SELECT * FROM OrderItem;
SELECT * FROM Payment;
SELECT * FROM Review;
SELECT * FROM Complaint;
SELECT * FROM Inspection;

------------------------------------------------------------
-- Order Details Query
------------------------------------------------------------
SELECT co.OrderID, co.OrderType, co.OrderStatus,
ISNULL(ua.Username, co.GuestName) AS CustomerName,
fs.StallName, mi.ItemName, oi.Quantity, oi.UnitPrice, oi.Subtotal, co.TotalAmount, p.PaymentMethod, p.PaymentStatus, co.OrderDateTime
FROM CustomerOrder co
LEFT JOIN UserAccount ua ON co.UserID = ua.UserID
JOIN OrderItem oi ON co.OrderID = oi.OrderID
JOIN MenuItem mi ON oi.MenuItemID = mi.MenuItemID
JOIN FoodStall fs ON mi.StallID = fs.StallID
LEFT JOIN Payment p ON co.OrderID = p.OrderID
ORDER BY co.OrderID;

------------------------------------------------------------
-- Active Order Query
------------------------------------------------------------

SELECT * FROM CustomerOrder
WHERE OrderStatus IN ('Pending', 'Preparing', 'Ready');

------------------------------------------------------------
-- Past Order Query
------------------------------------------------------------

SELECT * FROM CustomerOrder
WHERE OrderStatus IN ('Completed', 'Cancelled');