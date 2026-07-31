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

/* Table: Operator */
/* Declared before UserAccount because an operator staff account refers to it */
CREATE TABLE Operator
(
    OperatorID      INT IDENTITY(1,1)       NOT NULL,
    OperatorName    VARCHAR(80)             NOT NULL,
    ContactPerson   VARCHAR(80)             NOT NULL,
    ContactNo       VARCHAR(15)             NULL,

    CONSTRAINT      PK_Operator             PRIMARY KEY (OperatorID)
);

/* Table: Users */
/* OperatorID is filled in for operator accounts only and stays NULL for the
   customer, vendor and NEA officer roles. It is the column that decides
   which hawker centres an operator is allowed to manage. */
CREATE TABLE UserAccount
(
    UserID          INT IDENTITY(1,1)       NOT NULL,
    Username        VARCHAR(50)             NOT NULL,
    Email           VARCHAR(100)            NOT NULL,
    PasswordHash    VARCHAR(255)            NOT NULL,
    Role            VARCHAR(20)             NOT NULL,
    OperatorID      INT                     NULL,
    CreatedAt       DATETIME                NOT NULL DEFAULT GETDATE(),

    CONSTRAINT      PK_UserAccount          PRIMARY KEY (UserID),
    CONSTRAINT      UQ_UserAccount_Username UNIQUE (Username),
    CONSTRAINT      UQ_UserAccount_Email    UNIQUE (Email),
    CONSTRAINT      CHK_UserAccount_Role    CHECK (Role IN ('customer', 'vendor', 'nea_officer', 'operator')),
    CONSTRAINT      CHK_UserAccount_Operator
        CHECK ((Role = 'operator' AND OperatorID IS NOT NULL)
            OR (Role <> 'operator' AND OperatorID IS NULL)),
    CONSTRAINT      FK_UserAccount_Operator
        FOREIGN KEY (OperatorID) REFERENCES Operator(OperatorID)
);

/* Table: HawkerCentre */
CREATE TABLE HawkerCentre
(
    HawkerCentreID  INT IDENTITY(1,1)       NOT NULL,
    HCName          VARCHAR(80)             NOT NULL,
    HCAddress       VARCHAR(150)            NOT NULL,
    Area            VARCHAR(50)             NULL,
    OperatorID      INT                     NOT NULL,

    CONSTRAINT      PK_HawkerCentre         PRIMARY KEY (HawkerCentreID),
    CONSTRAINT      FK_HawkerCentre_Operator
        FOREIGN KEY (OperatorID) REFERENCES Operator(OperatorID)
);

/* Table: FoodStall */
CREATE TABLE FoodStall
(
    StallID         INT IDENTITY(1,1)           NOT NULL,
    VendorUserID    INT                         NULL,
    StallUnitNo     VARCHAR(10)                 NOT NULL,
    StallName       VARCHAR(80)                 NOT NULL,
    StallDesc       VARCHAR(300)                NULL,
    StallImage      VARCHAR(255)                NULL,
    IsActive        BIT                         NOT NULL DEFAULT 1,
    HawkerCentreID  INT                         NOT NULL,

    CONSTRAINT      PK_FoodStall                PRIMARY KEY (StallID),
    CONSTRAINT      UQ_FoodStall_Centre_Unit    UNIQUE (HawkerCentreID, StallUnitNo),
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
        CHECK (TotalAmount >= 0.01),
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
    OrderItemID         INT IDENTITY(1,1)                   NOT NULL,
    OrderID             INT                                 NOT NULL,
    MenuItemID          INT                                 NOT NULL,
    Quantity            INT                                 NOT NULL,
    UnitPrice           DECIMAL(6,2)                        NOT NULL,
    Subtotal            AS (Quantity * UnitPrice) PERSISTED,

    CONSTRAINT          PK_OrderItem                        PRIMARY KEY (OrderItemID),
    CONSTRAINT          UQ_OrderItem_OrderID_MenuItemID     UNIQUE (OrderID, MenuItemID),
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
    CONSTRAINT             FK_Payment_CustomerOrder
        FOREIGN KEY (OrderID) REFERENCES CustomerOrder(OrderID),
    CONSTRAINT             CHK_Payment_Method
        CHECK (PaymentMethod IN ('Cash', 'Card', 'PayNow')),
    CONSTRAINT             CHK_Payment_Status
        CHECK (PaymentStatus IN ('Pending', 'Successful', 'Failed', 'Refunded')),
    CONSTRAINT             CHK_Payment_Amount
        CHECK (Amount >= 0.01)
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
    TerminatedOn      DATE                  NULL,

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

/* Table: AgreementOffer */
/* New tenancy terms an operator puts to a vendor. The RentalAgreement itself is
   left alone until the vendor signs, so a vendor who rejects a higher rent
   simply keeps the agreement that is already in force. The signature is the
   vendor typing their own name, kept next to a hash of what they agreed to so
   the signed terms can be shown to have not been altered afterwards. */
CREATE TABLE AgreementOffer
(
    OfferID              INT IDENTITY(1,1)  NOT NULL,
    AgreementID          INT                NOT NULL,
    OfferedByUserID      INT                NOT NULL,
    ProposedEndDate      DATE               NOT NULL,
    ProposedRentalPrice  DECIMAL(8,2)       NOT NULL,
    OfferNote            VARCHAR(500)       NULL,
    OfferStatus          VARCHAR(30)        NOT NULL DEFAULT 'Pending Signature',
    CreatedAt            DATETIME           NOT NULL DEFAULT GETDATE(),
    RespondedAt          DATETIME           NULL,
    SignatureName        VARCHAR(80)        NULL,
    SignatureHash        CHAR(64)           NULL,
    ResponseNote         VARCHAR(300)       NULL,

    CONSTRAINT           PK_AgreementOffer  PRIMARY KEY (OfferID),
    CONSTRAINT           FK_AgreementOffer_RentalAgreement
        FOREIGN KEY (AgreementID) REFERENCES RentalAgreement(AgreementID),
    CONSTRAINT           FK_AgreementOffer_UserAccount
        FOREIGN KEY (OfferedByUserID) REFERENCES UserAccount(UserID),
    CONSTRAINT           CHK_AgreementOffer_Status
        CHECK (OfferStatus IN ('Pending Signature', 'Signed', 'Rejected', 'Withdrawn')),
    CONSTRAINT           CHK_AgreementOffer_RentalPrice
        CHECK (ProposedRentalPrice >= 0.01),
    /* A signed offer has to carry the name that was signed against it */
    CONSTRAINT           CHK_AgreementOffer_Signature
        CHECK (
            (OfferStatus = 'Signed' AND SignatureName IS NOT NULL AND SignatureHash IS NOT NULL)
            OR
            (OfferStatus <> 'Signed' AND SignatureName IS NULL AND SignatureHash IS NULL)
        )
);

/* An agreement may only have one offer waiting on the vendor at a time, so an
   operator cannot leave several conflicting sets of terms open at once */
CREATE UNIQUE INDEX UX_AgreementOffer_OpenPerAgreement
ON AgreementOffer(AgreementID)
WHERE OfferStatus = 'Pending Signature';

/* Table: Notification */
/* The inbox behind the vendor dashboard. OrderID and OfferID say what the
   notification is about, and exactly one of them is filled in. */
CREATE TABLE Notification
(
    NotificationID    INT IDENTITY(1,1)   NOT NULL,
    RecipientUserID   INT                 NOT NULL,
    NotificationType  VARCHAR(30)         NOT NULL,
    Title             VARCHAR(120)        NOT NULL,
    Message           VARCHAR(500)        NOT NULL,
    OrderID           INT                 NULL,
    OfferID           INT                 NULL,
    IsRead            BIT                 NOT NULL DEFAULT 0,
    CreatedAt         DATETIME            NOT NULL DEFAULT GETDATE(),
    ReadAt            DATETIME            NULL,

    CONSTRAINT        PK_Notification     PRIMARY KEY (NotificationID),
    CONSTRAINT        FK_Notification_UserAccount
        FOREIGN KEY (RecipientUserID) REFERENCES UserAccount(UserID),
    CONSTRAINT        FK_Notification_CustomerOrder
        FOREIGN KEY (OrderID) REFERENCES CustomerOrder(OrderID)
        ON DELETE CASCADE,
    CONSTRAINT        FK_Notification_AgreementOffer
        FOREIGN KEY (OfferID) REFERENCES AgreementOffer(OfferID),
    CONSTRAINT        CHK_Notification_Type
        CHECK (NotificationType IN ('Order', 'Agreement Offer', 'Agreement Signed', 'Agreement Rejected')),
    CONSTRAINT        CHK_Notification_Subject
        CHECK (
            (NotificationType = 'Order' AND OrderID IS NOT NULL AND OfferID IS NULL)
            OR
            (NotificationType <> 'Order' AND OfferID IS NOT NULL AND OrderID IS NULL)
        )
);

CREATE INDEX IX_Notification_RecipientUserID_CreatedAt
ON Notification(RecipientUserID, CreatedAt DESC);

/* Table: ReviewReply */
/* The vendor's public answer to a customer review. One reply per review keeps
   the exchange readable and leaves the last word with the customer's review. */
CREATE TABLE ReviewReply
(
    ReplyID         INT IDENTITY(1,1)   NOT NULL,
    ReviewID        INT                 NOT NULL,
    VendorUserID    INT                 NOT NULL,
    ReplyText       VARCHAR(500)        NOT NULL,
    CreatedAt       DATETIME            NOT NULL DEFAULT GETDATE(),
    UpdatedAt       DATETIME            NULL,

    CONSTRAINT      PK_ReviewReply      PRIMARY KEY (ReplyID),
    CONSTRAINT      UQ_ReviewReply_ReviewID UNIQUE (ReviewID),
    CONSTRAINT      FK_ReviewReply_Review
        FOREIGN KEY (ReviewID) REFERENCES Review(ReviewID)
        ON DELETE CASCADE,
    CONSTRAINT      FK_ReviewReply_UserAccount
        FOREIGN KEY (VendorUserID) REFERENCES UserAccount(UserID)
);
GO

/* Trigger: notify the vendor of a stall whenever an order reaches it */
/* The trigger sits on OrderItem rather than CustomerOrder because the order row
   is written before its items, so the stall behind an order is only knowable
   once the items exist. Grouping by vendor and order means one notification per
   vendor per order however many items that order holds. */
CREATE TRIGGER TR_OrderItem_NotifyVendor
ON OrderItem
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO Notification (RecipientUserID, NotificationType, Title, Message, OrderID)
    SELECT
        fs.VendorUserID,
        'Order',
        'New order #' + CAST(i.OrderID AS VARCHAR(12)),
        'A new order was placed at ' + MIN(fs.StallName) + '.',
        i.OrderID
    FROM inserted i
    JOIN MenuItem mi
        ON i.MenuItemID = mi.MenuItemID
    JOIN FoodStall fs
        ON mi.StallID = fs.StallID
    WHERE fs.VendorUserID IS NOT NULL
      AND NOT EXISTS (
            SELECT 1
            FROM Notification n
            WHERE n.OrderID = i.OrderID
              AND n.RecipientUserID = fs.VendorUserID
              AND n.NotificationType = 'Order'
        )
    GROUP BY fs.VendorUserID, i.OrderID;
END;
GO

------------------------------------------------------------
-- Insert Sample Data (HawkerManagementDB)
------------------------------------------------------------
------------------------------------------------------------
-- Sample User Accounts
-- All seeded user accounts use the same password:
-- Password: Password123!
--
-- Passwords are stored as bcrypt hashes for security
------------------------------------------------------------

INSERT INTO UserAccount (Username, Email, PasswordHash, Role)
VALUES
('mervin_customer', 'mervin.customer@example.com', '$2b$10$T4yh/Yap6UdkV/jXYYItTuYU3UsfjPpaG7jrAD8Af8mJtHpiD4Y/G', 'customer'),
('leris_customer', 'leris.customer@example.com', '$2b$10$T4yh/Yap6UdkV/jXYYItTuYU3UsfjPpaG7jrAD8Af8mJtHpiD4Y/G', 'customer'),
('louis_vendor', 'louis.vendor@example.com', '$2b$10$T4yh/Yap6UdkV/jXYYItTuYU3UsfjPpaG7jrAD8Af8mJtHpiD4Y/G', 'vendor'),
('rayne_nea', 'rayne.nea@example.com', '$2b$10$T4yh/Yap6UdkV/jXYYItTuYU3UsfjPpaG7jrAD8Af8mJtHpiD4Y/G', 'nea_officer'),
('nigel_customer', 'nigel.customer@example.com', '$2b$10$T4yh/Yap6UdkV/jXYYItTuYU3UsfjPpaG7jrAD8Af8mJtHpiD4Y/G', 'customer'),
('ming_li_customer', 'mingli.customer@example.com', '$2b$10$T4yh/Yap6UdkV/jXYYItTuYU3UsfjPpaG7jrAD8Af8mJtHpiD4Y/G', 'customer'),
('callula_nea', 'callula.nea@example.com', '$2b$10$T4yh/Yap6UdkV/jXYYItTuYU3UsfjPpaG7jrAD8Af8mJtHpiD4Y/G', 'nea_officer');

INSERT INTO Operator (OperatorName, ContactPerson, ContactNo)
VALUES
('Pang Food Operations', 'Adrian Chua', '81234567'),
('Singapore Hawker Group', 'Benjamin Koh', '82345678');

-- The login account of each operator's contact person. These are added after
-- the Operator rows because OperatorID has to point at an operator that exists.
INSERT INTO UserAccount (Username, Email, PasswordHash, Role, OperatorID)
VALUES
('adrian_operator', 'adrian.operator@example.com', '$2b$10$T4yh/Yap6UdkV/jXYYItTuYU3UsfjPpaG7jrAD8Af8mJtHpiD4Y/G', 'operator', 1),
('benjamin_operator', 'benjamin.operator@example.com', '$2b$10$T4yh/Yap6UdkV/jXYYItTuYU3UsfjPpaG7jrAD8Af8mJtHpiD4Y/G', 'operator', 2);

INSERT INTO HawkerCentre (HCName, HCAddress, Area, OperatorID)
VALUES
('Beauty World Food Centre', '144 Upper Bukit Timah Road, Singapore 588177', 'Bukit Timah', 1),
('Maxwell Food Centre', '1 Kadayanallur Street, Singapore 069184', 'Tanjong Pagar', 2),
('Bedok Interchange Hawker Centre', '208B New Upper Changi Road, Singapore 462208', 'Bedok', 1),
('Tampines Round Market & Food Centre', '137 Tampines Street 11, Singapore 521137', 'Tampines', 2);

-- Stalls 4 to 7 have no vendor yet, so they are available for rental
INSERT INTO FoodStall (VendorUserID, StallUnitNo, StallName, StallDesc, StallImage, IsActive, HawkerCentreID)
VALUES
(3, '#01-01', 'Ah Tan Chicken Rice', 'Enjoy classic steamed or roasted chicken rice, served with fragrant rice and traditional sauces.', '/images/Stall 01 Banner.jpg', 1, 1),
(3, '#01-02', 'Muthu Prata House', 'Discover freshly prepared prata served with flavourful curries and popular local favourites.', '/images/Stall 02 Banner.jpg', 1, 1),
(3, '#02-01', 'Selera Nasi Lemak', 'Enjoy nasi lemak served with a crispy chicken wing, fragrant coconut rice, and sambal.', '/images/Stall 03 Banner.jpg', 1, 2),
(NULL, '#01-05', 'Bedok Fishball Noodles', 'Handmade fishballs served with springy noodles and house-made chilli.', '/images/Stall 04 banner.jpg', 0, 3),
(NULL, '#01-08', 'Changi Road Laksa', 'Rich coconut laksa gravy simmered daily with fresh cockles and prawns.', '/images/Stall 05 banner.jpg', 1, 3),
(NULL, '#02-11', 'Tampines Carrot Cake', 'Black and white carrot cake fried to order over high heat.', '/images/Stall 06 banner.jpg', 1, 4),
(NULL, '#02-14', 'Round Market Ban Mian', 'Hand-torn noodles in anchovy broth topped with a soft egg.', '/images/Stall 07 banner.jpg', 1, 4);

INSERT INTO Cuisine (CuisineName, CuisineDesc)
VALUES
('Chinese', 'Chinese hawker dishes'),
('Indian', 'Indian hawker dishes'),
('Malay', 'Malay hawker dishes'),
('Drinks', 'Beverages and desserts');

INSERT INTO MenuItem (StallID, ItemName, ItemDesc, ItemPrice, ItemCategory, ItemImage, IsAvailable)
VALUES
(1, 'Steamed Chicken Rice', 'Tender steamed chicken served with fragrant rice and house-made chilli sauce.', 4.50, 'Main Dish', '/images/Steamed Chicken Rice.jpg', 1),
(1, 'Roasted Chicken Rice', 'Juicy roasted chicken served with fragrant rice and traditional dipping sauces.', 5.00, 'Main Dish', '/images/Roasted Chicken Rice.jpg', 1),
(1, 'Chicken Soup', 'A comforting chicken soup prepared with tender chicken and a flavourful broth.', 1.20, 'Side', '/images/Chicken Soup.png', 0),
(2, 'Plain Prata', 'Freshly prepared crispy prata served with aromatic curry for a classic local favourite.', 1.50, 'Main Dish', '/images/Plain Prata.jpg', 1),
(2, 'Egg Prata', 'Freshly prepared crispy prata served with aromatic curry for a classic local favourite.', 2.20, 'Main Dish', '/images/Egg Prata.jpg', 1),
(3, 'Nasi Lemak Chicken Wing', 'Fragrant coconut rice served with a crispy chicken wing, egg, peanuts, cucumber, and homemade sambal.', 4.80, 'Main Dish', '/images/Nasi Lemak.jpg', 1),
(3, 'Iced Milo', 'A refreshing iced Milo made with rich chocolate malt for the perfect accompaniment to your meal.', 1.80, 'Drink', '/images/Iced Milo.jpg', 1),
(4, 'Fishball Noodle Soup', 'Springy noodles in a clear pork and anchovy broth.', 4.00, 'Main Dish', '/images/fishball noodle soup.png', 1),
(4, 'Dry Mee Pok', 'Tossed in vinegar, chilli and fried shallots.', 4.50, 'Main Dish', '/images/mee pok dry .png', 1),
(4, 'Iced Barley', 'House-brewed barley served chilled.', 1.60, 'Drink', '/images/ice barely.png', 1),
(5, 'Signature Laksa', 'Thick bee hoon in coconut laksa gravy.', 5.50, 'Main Dish', '/images/Signature laksa.png', 1),
(5, 'Laksa with Extra Cockles', 'Signature laksa with a double portion of cockles.', 7.00, 'Main Dish', '/images/laksa (extra cockles).png', 1),
(5, 'Sugar Cane Juice', 'Freshly pressed sugar cane.', 2.00, 'Drink', '/images/sugar cane juice.png', 1),
(6, 'White Carrot Cake', 'Fried with egg and preserved radish.', 4.00, 'Main Dish', '/images/white carrot cake .png', 1),
(6, 'Black Carrot Cake', 'Fried with sweet dark soy sauce.', 4.20, 'Main Dish', '/images/black carrot cake.png', 1),
(6, 'Kopi O', 'Traditional black coffee.', 1.40, 'Drink', '/images/kopi o .png', 1),
(7, 'Ban Mian with Egg', 'Hand-torn noodles in anchovy broth.', 5.00, 'Main Dish', '/images/Ban mian .png', 1),
(7, 'Mee Hoon Kuey', 'Thin flat noodles with minced meat.', 5.20, 'Main Dish', '/images/mee hoon kueh.png', 1),
(7, 'Homemade Soya Bean', 'Lightly sweetened soya bean milk.', 1.50, 'Drink', '/images/Soya bean .png', 1);

INSERT INTO MenuItemCuisine (MenuItemID, CuisineID)
VALUES
(1, 1),
(2, 1),
(3, 1),
(4, 2),
(5, 2),
(6, 3),
(7, 4);

INSERT INTO CustomerOrder (UserID, GuestName, GuestEmail, GuestOrderReference, OrderType, OrderStatus, TotalAmount, SpecialInstructions, OrderDateTime, UpdatedAt)
VALUES
(1, NULL, NULL, NULL, 'Member', 'Pending', 9.50, 'Less chilli please', DATEADD(MINUTE, -20, GETDATE()), DATEADD(MINUTE, -20, GETDATE())),
(NULL, 'Patcharapon', 'patcharapon@example.com', 'GUEST-20260726-A8K4Q2', 'Guest', 'Preparing', 5.20, 'Pack the curry separately', DATEADD(MINUTE, -35, GETDATE()), DATEADD(MINUTE, -15, GETDATE())),
(1, NULL, NULL, NULL, 'Member', 'Completed', 4.80, NULL, DATEADD(HOUR, -2, GETDATE()), DATEADD(MINUTE, -60, GETDATE()));

INSERT INTO OrderStatusHistory (OrderID, OrderStatus, StatusDateTime, UpdatedByUserID)
VALUES
(1, 'Pending', DATEADD(MINUTE, -20, GETDATE()), NULL),
(2, 'Pending', DATEADD(MINUTE, -35, GETDATE()), NULL),
(2, 'Preparing', DATEADD(MINUTE, -15, GETDATE()), 3),
(3, 'Pending', DATEADD(HOUR, -2, GETDATE()), NULL),
(3, 'Preparing', DATEADD(MINUTE, -100, GETDATE()), 3),
(3, 'Ready', DATEADD(MINUTE, -70, GETDATE()), 3),
(3, 'Completed', DATEADD(MINUTE, -60, GETDATE()), 3);

INSERT INTO OrderItem (OrderID, MenuItemID, Quantity, UnitPrice)
VALUES
(1, 1, 1, 4.50),
(1, 2, 1, 5.00),
(2, 4, 2, 1.50),
(2, 5, 1, 2.20),
(3, 6, 1, 4.80);

INSERT INTO Payment (OrderID, PaymentMethod, PaymentStatus, Amount, TransactionReference, PaidAt)
VALUES
(1, 'PayNow', 'Successful', 9.50, 'PN-20260726-000001', DATEADD(MINUTE, -19, GETDATE())),
(2, 'Cash', 'Pending', 5.20, NULL, NULL),
(3, 'Card', 'Successful', 4.80, 'CARD-20260726-000003', DATEADD(MINUTE, -110, GETDATE()));

-- Every stall carries a few reviews so the ratings on the reviews page differ
-- from one stall to the next. Only customer accounts leave reviews.
INSERT INTO Review (UserID, StallID, Rating, ReviewComment)
VALUES
(1, 1, 5, 'Chicken rice was delicious and affordable.'),
(5, 1, 4, 'Roasted chicken was tender but the queue moved slowly.'),
(6, 1, 5, 'The chilli sauce here is the best in the centre.'),

(2, 2, 4, 'Prata was crispy and served quickly.'),
(1, 2, 3, 'Curry was a bit thin for my liking. The prata itself was fine.'),
(6, 2, 4, 'Good value for breakfast and it comes straight off the griddle.'),

(1, 3, 5, 'Nasi lemak was tasty and filling.'),
(2, 3, 5, 'Sambal has a proper kick and the rice smells of coconut.'),
(5, 3, 4, 'Chicken wing was crispy, though I waited a while for it.'),

(2, 4, 4, 'Fishballs are handmade and you can taste the difference.'),
(5, 4, 5, 'Springy noodles and the chilli is not too sweet. Will come back.'),
(6, 4, 3, 'Portion was smaller than I expected for the price.'),

(1, 5, 5, 'Gravy is rich without being too heavy and the cockles were fresh.'),
(5, 5, 4, 'Solid bowl of laksa. They were generous with the prawns.'),
(2, 5, 4, 'Tasty, but I asked for less spicy and it still came quite hot.'),

(6, 6, 3, 'White carrot cake was alright, nothing special.'),
(1, 6, 2, 'Came out oily and lukewarm. Disappointed after queueing.'),
(2, 6, 4, 'The black version is much better than the white one. Good wok hei.'),

(5, 7, 4, 'Noodles are hand torn and the broth tastes of real anchovies.'),
(6, 7, 3, 'Broth was slightly salty for me but the egg was done right.'),
(1, 7, 5, 'Comforting bowl on a rainy day. Generous with the ikan bilis.');

INSERT INTO Complaint (UserID, StallID, ComplaintTitle, ComplaintDesc, ComplaintStatus)
VALUES
(2, 1, 'Long waiting time', 'The waiting time was longer than expected during lunch hour.', 'Pending'),
(1, 2, 'Wrong order received', 'I ordered egg prata but received plain prata.', 'In Review');

-- Round Market Ban Mian is left uninspected so an ungraded stall can be tested
INSERT INTO Inspection (OfficerUserID, StallID, HygieneGrade, InspectionStatus)
VALUES
(4, 1, 'A', 'Submitted'),
(4, 2, 'B', 'Follow-up Required'),
(4, 3, 'A', 'Reviewed'),
(4, 4, 'A', 'Submitted'),
(4, 5, 'B', 'Submitted'),
(4, 6, 'C', 'Submitted');

INSERT INTO InspectionRemark (InspectionID, RemarkText)
VALUES
(1, 'Stall is clean and food handling practices are good.'),
(2, 'Minor cleanliness improvements required near preparation area.'),
(3, 'Good hygiene standards observed.');

INSERT INTO RentalAgreement (StallID, VendorUserID, StartDate, EndDate, RentalPrice, TermCondition)
VALUES
(1, 3, '2026-01-01', '2026-12-31', 1200.00, 'Monthly rental agreement for stall operations.'),
(2, 3, '2026-01-01', '2026-12-31', 1100.00, 'Vendor must comply with hygiene requirements.'),
(3, 3, '2026-01-01', '2026-12-31', 1150.00, 'Vendor must comply with hygiene and food safety requirements.');

-- A renewal of the Ah Tan Chicken Rice tenancy at a higher rent, put to the
-- vendor by the operator of Beauty World Food Centre and still unsigned, so the
-- vendor inbox has a live offer to accept or turn down
INSERT INTO AgreementOffer
    (AgreementID, OfferedByUserID, ProposedEndDate, ProposedRentalPrice, OfferNote)
VALUES
(1, 8, '2027-12-31', 1450.00, 'Renewal for the 2027 term. The rent reflects the centre-wide revision of unit rates.');

INSERT INTO Notification (RecipientUserID, NotificationType, Title, Message, OfferID)
VALUES
(3, 'Agreement Offer', 'Renewal offer for Ah Tan Chicken Rice',
 'Pang Food Operations has proposed new tenancy terms of $1450.00 per month until 31 Dec 2027. Sign the offer to accept it, or reject it to stay on your current agreement.', 1);

INSERT INTO ReviewReply (ReviewID, VendorUserID, ReplyText)
VALUES
(1, 3, 'Thank you for the kind words. We steam the chicken in small batches through the day so it stays tender.');

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
SELECT * FROM RentalAgreement;
SELECT * FROM AgreementOffer;
SELECT * FROM Notification;
SELECT * FROM ReviewReply;

------------------------------------------------------------
-- Stalls by Area Query
------------------------------------------------------------
SELECT hc.Area, hc.HCName, fs.StallName, fs.StallUnitNo,
grade.HygieneGrade, AVG(mi.ItemPrice) AS AveragePrice
FROM HawkerCentre hc
JOIN FoodStall fs ON hc.HawkerCentreID = fs.HawkerCentreID
LEFT JOIN MenuItem mi ON fs.StallID = mi.StallID AND mi.IsAvailable = 1
OUTER APPLY (
    SELECT TOP 1 i.HygieneGrade
    FROM Inspection i
    WHERE i.StallID = fs.StallID
    ORDER BY i.InspectionDate DESC, i.InspectionID DESC
) grade
WHERE fs.IsActive = 1
GROUP BY hc.Area, hc.HCName, fs.StallName, fs.StallUnitNo, grade.HygieneGrade
ORDER BY hc.Area, fs.StallName;

------------------------------------------------------------
-- Operator Portfolio Query
-- The stalls an operator account is allowed to manage, found by following
-- the operator to its hawker centres and then to the stalls in them
------------------------------------------------------------
SELECT staff.Username AS OperatorAccount, o.OperatorName,
hc.HCName, fs.StallID, fs.StallName, ra.EndDate AS TenancyEnds
FROM Operator o
JOIN UserAccount staff ON staff.OperatorID = o.OperatorID AND staff.Role = 'operator'
JOIN HawkerCentre hc ON hc.OperatorID = o.OperatorID
JOIN FoodStall fs ON fs.HawkerCentreID = hc.HawkerCentreID
LEFT JOIN RentalAgreement ra ON ra.StallID = fs.StallID
AND CAST(GETDATE() AS DATE) BETWEEN ra.StartDate AND ra.EndDate
ORDER BY o.OperatorID, hc.HCName, fs.StallID;

------------------------------------------------------------
-- Stall Tenancy Query
-- The vendor of a stall should match the vendor on its current agreement
------------------------------------------------------------
SELECT fs.StallID, fs.StallName,
operator.Username AS OperatedBy, tenant.Username AS RentedBy, ra.EndDate
FROM FoodStall fs
LEFT JOIN UserAccount operator ON fs.VendorUserID = operator.UserID
LEFT JOIN RentalAgreement ra ON fs.StallID = ra.StallID
AND CAST(GETDATE() AS DATE) BETWEEN ra.StartDate AND ra.EndDate
LEFT JOIN UserAccount tenant ON ra.VendorUserID = tenant.UserID
ORDER BY fs.StallID;

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
