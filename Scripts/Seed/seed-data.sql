-- Seed data for Jewellery Store Management System
-- Password for all users: admin123 (bcrypt hash with 10 rounds)

SET time_zone = 'SYSTEM';

-- =============================================
-- Users
-- =============================================
INSERT INTO `users` (`userName`, `email`, `password`, `type`) VALUES
  ('admin',   'admin@jewellerystore.com',   '$2a$10$aeAxxnSaN5dOiPhW.g8AEep46P4lm0KtiOpe8Lv/TVxHjn0BYm//u', 'admin'),
  ('manager', 'manager@jewellerystore.com', '$2a$10$aeAxxnSaN5dOiPhW.g8AEep46P4lm0KtiOpe8Lv/TVxHjn0BYm//u', 'manager'),
  ('cashier', 'cashier@jewellerystore.com', '$2a$10$aeAxxnSaN5dOiPhW.g8AEep46P4lm0KtiOpe8Lv/TVxHjn0BYm//u', 'employee');

-- =============================================
-- Customers
-- =============================================
INSERT INTO `customers` (`customerGuid`, `firstName`, `lastName`, `dateOfBirth`, `gender`, `address`, `city`, `email`, `phoneNumber`) VALUES
  (UUID(), 'Aarav',   'Sharma',   '1985-03-15', 'male',   '12, MG Road',               'Mumbai',    'aarav.sharma@email.com',   '+91-9876543210'),
  (UUID(), 'Priya',   'Patel',    '1990-07-22', 'female', '45, Jubilee Hills',          'Hyderabad', 'priya.patel@email.com',    '+91-9876543211'),
  (UUID(), 'Rohan',   'Mehta',    '1978-11-08', 'male',   '78, Connaught Place',        'Delhi',     'rohan.mehta@email.com',    '+91-9876543212'),
  (UUID(), 'Ananya',  'Reddy',    '1995-01-30', 'female', '23, Brigade Road',           'Bangalore', 'ananya.reddy@email.com',   '+91-9876543213'),
  (UUID(), 'Vikram',  'Singh',    '1982-06-18', 'male',   '56, Civil Lines',            'Jaipur',    'vikram.singh@email.com',   '+91-9876543214'),
  (UUID(), 'Neha',    'Gupta',    '1988-09-12', 'female', '90, Park Street',            'Kolkata',   'neha.gupta@email.com',     '+91-9876543215'),
  (UUID(), 'Arjun',   'Nair',     '1975-04-25', 'male',   '34, Marine Drive',           'Kochi',     'arjun.nair@email.com',     '+91-9876543216'),
  (UUID(), 'Kavita',  'Joshi',    '1992-12-05', 'female', '67, FC Road',                'Pune',      'kavita.joshi@email.com',   '+91-9876543217'),
  (UUID(), 'Suresh',  'Iyer',     '1980-08-20', 'male',   '11, Anna Salai',             'Chennai',   'suresh.iyer@email.com',    '+91-9876543218'),
  (UUID(), 'Deepika', 'Verma',    '1998-02-14', 'female', '89, Hazratganj',             'Lucknow',   'deepika.verma@email.com',  '+91-9876543219');

-- =============================================
-- Master Categories (Metal type)
-- =============================================
INSERT INTO `mastercategories` (`masterCategoryName`, `masterCategoryDescription`) VALUES
  ('Gold',     'Pure and alloyed gold jewellery - 18K, 22K, 24K'),
  ('Silver',   'Sterling silver and pure silver jewellery'),
  ('Diamond',  'Diamond-studded jewellery with certified stones'),
  ('Platinum', 'Platinum jewellery - premium and durable');

-- =============================================
-- Product Categories (Jewellery type)
-- =============================================
INSERT INTO `productcategories` (`productCategoryName`, `productCategoryDescription`) VALUES
  ('Necklace',  'Necklaces, chains, and chokers'),
  ('Ring',      'Engagement rings, bands, and fashion rings'),
  ('Earring',   'Studs, hoops, jhumkas, and danglers'),
  ('Bracelet',  'Bangles, bracelets, and kadas'),
  ('Pendant',   'Pendants and lockets'),
  ('Anklet',    'Anklets and paayals');

-- =============================================
-- Sub Categories (Design style)
-- =============================================
INSERT INTO `subcategories` (`subCategoryName`, `subCategoryDescription`) VALUES
  ('Traditional',  'Classic Indian traditional designs'),
  ('Modern',       'Contemporary and minimalist designs'),
  ('Antique',      'Vintage and antique-finish designs'),
  ('Bridal',       'Wedding and bridal collection'),
  ('Daily Wear',   'Lightweight everyday jewellery');

-- =============================================
-- Products (30 items across categories)
-- =============================================
INSERT INTO `products` (`productGuid`, `productWeight`, `productDescription`, `isSold`, `mid`, `sid`, `pid`) VALUES
  -- Gold items
  (UUID(), 15.50, '22K Gold Traditional Necklace with temple design',          0, 1, 1, 1),
  (UUID(), 5.20,  '18K Gold Modern Solitaire Ring',                            0, 1, 2, 2),
  (UUID(), 8.75,  '22K Gold Jhumka Earrings with pearl drops',                 0, 1, 1, 3),
  (UUID(), 25.00, '22K Gold Bridal Necklace Set with kundan work',             0, 1, 4, 1),
  (UUID(), 12.30, '18K Gold Modern Chain Bracelet',                            0, 1, 2, 4),
  (UUID(), 3.80,  '22K Gold Traditional Pendant with ruby',                    0, 1, 1, 5),
  (UUID(), 6.50,  '18K Gold Daily Wear Stud Earrings',                         0, 1, 5, 3),
  (UUID(), 18.00, '22K Gold Antique Temple Necklace',                          0, 1, 3, 1),
  -- Silver items
  (UUID(), 30.00, 'Sterling Silver Oxidized Jhumka Earrings',                  0, 2, 3, 3),
  (UUID(), 45.50, 'Silver Antique Tribal Necklace',                            0, 2, 3, 1),
  (UUID(), 20.00, 'Sterling Silver Modern Cuff Bracelet',                      0, 2, 2, 4),
  (UUID(), 10.25, 'Silver Traditional Toe Ring Set',                           0, 2, 1, 2),
  (UUID(), 35.00, 'Sterling Silver Daily Wear Anklet',                         0, 2, 5, 6),
  (UUID(), 15.75, 'Silver Filigree Pendant',                                   0, 2, 3, 5),
  -- Diamond items
  (UUID(), 4.20,  'Diamond Solitaire Engagement Ring - 0.5 carat',            0, 3, 2, 2),
  (UUID(), 8.50,  'Diamond Tennis Bracelet - 2 carat total',                   0, 3, 2, 4),
  (UUID(), 12.00, 'Diamond Bridal Necklace with emeralds',                     0, 3, 4, 1),
  (UUID(), 3.50,  'Diamond Stud Earrings - 0.25 carat each',                  0, 3, 2, 3),
  (UUID(), 2.80,  'Diamond Heart Pendant - 0.3 carat',                        0, 3, 2, 5),
  (UUID(), 6.00,  'Diamond Cluster Ring - vintage design',                     0, 3, 3, 2),
  -- Platinum items
  (UUID(), 8.00,  'Platinum Classic Wedding Band',                             0, 4, 2, 2),
  (UUID(), 6.50,  'Platinum Modern Bar Pendant',                               0, 4, 2, 5),
  (UUID(), 10.00, 'Platinum Chain Link Bracelet',                              0, 4, 2, 4),
  (UUID(), 4.50,  'Platinum Hoop Earrings',                                    0, 4, 2, 3),
  -- Some sold items for order history
  (UUID(), 22.00, '22K Gold Bridal Choker Necklace',                           1, 1, 4, 1),
  (UUID(), 7.30,  '18K Gold Engagement Ring with diamond',                     1, 1, 2, 2),
  (UUID(), 5.00,  'Diamond Drop Earrings - 0.4 carat',                        1, 3, 2, 3),
  (UUID(), 9.50,  'Platinum Eternity Band with diamonds',                      1, 4, 4, 2),
  (UUID(), 40.00, 'Silver Bridal Anklet with ghungroo',                        1, 2, 4, 6),
  (UUID(), 3.20,  '22K Gold Daily Wear Ring',                                  1, 1, 5, 2);

-- =============================================
-- Invoices (for the 6 sold products)
-- =============================================
INSERT INTO `invoices` (`invoiceGuid`, `totalAmountWithGst`, `totalAmountWithoutGstAndDiscount`, `totalDiscount`, `totalLabour`, `totalGst`, `isPaymentDone`, `remarks`, `soldToCustomer`, `createdAt`) VALUES
  (UUID(), 132000.00, 110000.00, 5000.00,  3000.00, 24000.00, 1, 'Bridal choker - premium gift wrapping',    1, '2025-11-15 10:30:00'),
  (UUID(), 48000.00,  40000.00,  2000.00,  1500.00, 8500.00,  1, 'Engagement ring - custom sizing',          3, '2025-12-20 14:00:00'),
  (UUID(), 85000.00,  72000.00,  3000.00,  2000.00, 14000.00, 1, 'Diamond drop earrings - gift certificate', 2, '2026-01-10 11:15:00'),
  (UUID(), 72000.00,  60000.00,  2500.00,  1800.00, 12700.00, 0, 'Platinum eternity band - partial payment', 5, '2026-02-14 16:45:00'),
  (UUID(), 18000.00,  15000.00,  500.00,   800.00,  2700.00,  1, 'Silver bridal anklet',                     4, '2026-03-05 09:00:00'),
  (UUID(), 24000.00,  20000.00,  1000.00,  600.00,  4400.00,  1, 'Gold daily wear ring',                     6, '2026-03-28 13:30:00');

-- =============================================
-- Invoice-Product Mappings
-- =============================================
INSERT INTO `invoice_products_mappings` (`sgst`, `cgst`, `discount`, `labour`, `price`, `finalAmount`, `invoiceId`, `ProductId`) VALUES
  (12000.00, 12000.00, 5000.00,  3000.00, 110000.00, 132000.00, 1, 25),
  (4250.00,  4250.00,  2000.00,  1500.00, 40000.00,  48000.00,  2, 26),
  (7000.00,  7000.00,  3000.00,  2000.00, 72000.00,  85000.00,  3, 27),
  (6350.00,  6350.00,  2500.00,  1800.00, 60000.00,  72000.00,  4, 28),
  (1350.00,  1350.00,  500.00,   800.00,  15000.00,  18000.00,  5, 29),
  (2200.00,  2200.00,  1000.00,  600.00,  20000.00,  24000.00,  6, 30);

-- =============================================
-- Payments
-- =============================================
INSERT INTO `payments` (`paymentGuid`, `amount`, `paymentType`, `remarks`, `receivedOn`, `invoiceId`) VALUES
  (UUID(), 132000.00, 'online',  'Full payment via UPI',             '2025-11-15 10:45:00', 1),
  (UUID(), 48000.00,  'cash',    'Full payment in cash',             '2025-12-20 14:30:00', 2),
  (UUID(), 85000.00,  'online',  'Full payment via bank transfer',   '2026-01-10 12:00:00', 3),
  (UUID(), 40000.00,  'cheque',  'Partial payment - cheque #10234',  '2026-02-14 17:00:00', 4),
  (UUID(), 18000.00,  'cash',    'Full payment in cash',             '2026-03-05 09:15:00', 5),
  (UUID(), 24000.00,  'online',  'Full payment via UPI',             '2026-03-28 14:00:00', 6);
