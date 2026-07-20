-- =====================================================================
-- Jewellery Store Management System — dummy seed data
--
-- Every account below shares the same bcrypt hash for "admin123".
-- Do NOT ship this hash to production — it is intentionally weak so
-- pilot users can log in without a password reset dance.
-- =====================================================================

SET time_zone = 'SYSTEM';

-- =============================================
-- Shop identity
-- =============================================
INSERT INTO `shopsettings`
  (id, shopName, gstin, pan, addressLine1, addressLine2, city, state, stateCode,
   pincode, phone, email, logoPath, invoicePrefix, invoiceStartFrom,
   currentInvoiceCounter, defaultCurrency, timezone, roundOffEnabled)
VALUES
  (1,
   'Radiance Jewellers',
   '27ABCDE1234F1Z5',
   'ABCDE1234F',
   'Shop 12, Zaveri Bazaar',
   'Kalbadevi Road',
   'Mumbai',
   'Maharashtra',
   '27',
   '400002',
   '+91-22-2340-1122',
   'contact@radiancejewellers.in',
   NULL,
   'RAD/2026/',
   1,
   1,
   'INR',
   'Asia/Kolkata',
   1);

-- =============================================
-- Purities (static reference)
-- =============================================
INSERT INTO `purities` (code, label, metalType, fineness, sortOrder) VALUES
  ('999',  '24K Gold (999)',      'gold',   999, 10),
  ('916',  '22K Gold (916)',      'gold',   916, 20),
  ('875',  '21K Gold (875)',      'gold',   875, 30),
  ('750',  '18K Gold (750)',      'gold',   750, 40),
  ('585',  '14K Gold (585)',      'gold',   585, 50),
  ('S999', 'Fine Silver (999)',   'silver', 999, 60);

-- =============================================
-- Tax slabs
-- =============================================
INSERT INTO `taxslabs`
  (hsnCode, name, cgstRate, sgstRate, igstRate, active, effectiveFrom)
VALUES
  ('7113', 'Articles of jewellery of precious metal',   1.50, 1.50, 3.00, 1, '2024-01-01'),
  ('7114', 'Articles of goldsmiths / silversmiths',      1.50, 1.50, 3.00, 1, '2024-01-01'),
  ('7118', 'Coin',                                       1.50, 1.50, 3.00, 1, '2024-01-01');

-- =============================================
-- Users (all passwords = admin123)
-- =============================================
INSERT INTO `users` (`userName`, `email`, `password`, `type`, `permissions`) VALUES
  ('admin',    'admin@radiancejewellers.in',    '$2a$10$aeAxxnSaN5dOiPhW.g8AEep46P4lm0KtiOpe8Lv/TVxHjn0BYm//u', 'admin',    NULL),
  ('manager',  'manager@radiancejewellers.in',  '$2a$10$aeAxxnSaN5dOiPhW.g8AEep46P4lm0KtiOpe8Lv/TVxHjn0BYm//u', 'manager',  JSON_OBJECT('costsVisible', TRUE, 'canCancelInvoice', TRUE, 'canBackup', FALSE, 'canDeleteCustomer', TRUE, 'canDeleteProduct', TRUE, 'canEditShopSettings', TRUE, 'canManageUsers', FALSE, 'canForfeitSavingScheme', FALSE)),
  ('cashier1', 'cashier1@radiancejewellers.in', '$2a$10$aeAxxnSaN5dOiPhW.g8AEep46P4lm0KtiOpe8Lv/TVxHjn0BYm//u', 'employee', JSON_OBJECT('costsVisible', FALSE, 'canCancelInvoice', FALSE, 'canBackup', FALSE, 'canDeleteCustomer', FALSE, 'canDeleteProduct', FALSE, 'canEditShopSettings', FALSE, 'canManageUsers', FALSE, 'canForfeitSavingScheme', FALSE)),
  ('cashier2', 'cashier2@radiancejewellers.in', '$2a$10$aeAxxnSaN5dOiPhW.g8AEep46P4lm0KtiOpe8Lv/TVxHjn0BYm//u', 'employee', JSON_OBJECT('costsVisible', FALSE, 'canCancelInvoice', FALSE, 'canBackup', FALSE, 'canDeleteCustomer', FALSE, 'canDeleteProduct', FALSE, 'canEditShopSettings', FALSE, 'canManageUsers', FALSE, 'canForfeitSavingScheme', FALSE));

-- =============================================
-- Category masters (metal type / jewellery type / design style)
-- =============================================
INSERT INTO `mastercategories` (`masterCategoryName`, `masterCategoryDescription`) VALUES
  ('Gold',     'Pure and alloyed gold jewellery - 18K, 22K, 24K'),
  ('Silver',   'Sterling silver and pure silver jewellery'),
  ('Diamond',  'Diamond-studded jewellery with certified stones'),
  ('Platinum', 'Platinum jewellery - premium and durable');

INSERT INTO `productcategories` (`productCategoryName`, `productCategoryDescription`) VALUES
  ('Necklace',  'Necklaces, chains, and chokers'),
  ('Ring',      'Engagement rings, bands, and fashion rings'),
  ('Earring',   'Studs, hoops, jhumkas, and danglers'),
  ('Bracelet',  'Bangles, bracelets, and kadas'),
  ('Pendant',   'Pendants and lockets'),
  ('Anklet',    'Anklets and paayals');

INSERT INTO `subcategories` (`subCategoryName`, `subCategoryDescription`) VALUES
  ('Traditional',  'Classic Indian traditional designs'),
  ('Modern',       'Contemporary and minimalist designs'),
  ('Antique',      'Vintage and antique-finish designs'),
  ('Bridal',       'Wedding and bridal collection'),
  ('Daily Wear',   'Lightweight everyday jewellery');

-- =============================================
-- Customers (B2C + a couple of B2B with GSTIN/PAN)
-- =============================================
INSERT INTO `customers`
  (customerGuid, firstName, lastName, dateOfBirth, gender, address, city, state, stateCode,
   email, phoneNumber, gstin, pan, remarks, creditBalance)
VALUES
  (UUID(), 'Aarav',   'Sharma',   '1985-03-15', 'male',   '12, MG Road',           'Mumbai',    'Maharashtra',   '27', 'aarav.sharma@example.com',   '9876543210', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Priya',   'Patel',    '1990-07-22', 'female', '45, Jubilee Hills',     'Hyderabad', 'Telangana',     '36', 'priya.patel@example.com',    '9876543211', NULL,              NULL,         'Prefers antique',    0),
  (UUID(), 'Rohan',   'Mehta',    '1978-11-08', 'male',   '78, Connaught Place',   'Delhi',     'Delhi',         '07', 'rohan.mehta@example.com',    '9876543212', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Ananya',  'Reddy',    '1995-01-30', 'female', '23, Brigade Road',      'Bangalore', 'Karnataka',     '29', 'ananya.reddy@example.com',   '9876543213', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Vikram',  'Singh',    '1982-06-18', 'male',   '56, Civil Lines',       'Jaipur',    'Rajasthan',     '08', 'vikram.singh@example.com',   '9876543214', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Neha',    'Gupta',    '1988-09-12', 'female', '90, Park Street',       'Kolkata',   'West Bengal',   '19', 'neha.gupta@example.com',     '9876543215', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Arjun',   'Nair',     '1975-04-25', 'male',   '34, Marine Drive',      'Kochi',     'Kerala',        '32', 'arjun.nair@example.com',     '9876543216', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Kavita',  'Joshi',    '1992-12-05', 'female', '67, FC Road',           'Pune',      'Maharashtra',   '27', 'kavita.joshi@example.com',   '9876543217', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Suresh',  'Iyer',     '1980-08-20', 'male',   '11, Anna Salai',        'Chennai',   'Tamil Nadu',    '33', 'suresh.iyer@example.com',    '9876543218', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Deepika', 'Verma',    '1998-02-14', 'female', '89, Hazratganj',        'Lucknow',   'Uttar Pradesh', '09', 'deepika.verma@example.com',  '9876543219', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Karan',   'Malhotra', '1987-05-11', 'male',   '18, Sector 17',         'Chandigarh','Chandigarh',    '04', 'karan.malhotra@example.com', '9876543220', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Ishita',  'Bansal',   '1993-10-02', 'female', '3, Alkapuri',           'Vadodara',  'Gujarat',       '24', 'ishita.bansal@example.com',  '9876543221', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Manish',  'Kulkarni', '1979-03-27', 'male',   '77, Kothrud',           'Pune',      'Maharashtra',   '27', 'manish.kulkarni@example.com','9876543222', NULL,              NULL,         'Repeat buyer',       0),
  (UUID(), 'Ritu',    'Chopra',   '1991-11-19', 'female', '14, Vasant Kunj',       'Delhi',     'Delhi',         '07', 'ritu.chopra@example.com',    '9876543223', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Sanjay',  'Deshmukh', '1972-01-08', 'male',   '9, Deccan',             'Pune',      'Maharashtra',   '27', 'sanjay.deshmukh@example.com','9876543224', NULL,              NULL,         NULL,              1500),
  (UUID(), 'Meera',   'Rao',      '1994-06-30', 'female', '25, Banjara Hills',     'Hyderabad', 'Telangana',     '36', 'meera.rao@example.com',      '9876543225', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Rahul',   'Kapoor',   '1986-09-14', 'male',   '41, Powai',             'Mumbai',    'Maharashtra',   '27', 'rahul.kapoor@example.com',   '9876543226', NULL,              NULL,         NULL,                 0),
  (UUID(), 'Sneha',   'Bhat',     '1997-04-03', 'female', '19, Indiranagar',       'Bangalore', 'Karnataka',     '29', 'sneha.bhat@example.com',     '9876543227', NULL,              NULL,         NULL,                 0),
  -- B2B customers with GSTIN + PAN
  (UUID(), 'Divya',   'Enterprises', '1970-01-01', 'female', '55, Opera House',   'Mumbai',    'Maharashtra',   '27', 'accounts@divya-ent.example.com', '9876543228', '27DIVYA1234C1Z9', 'DIVYA1234C', 'Corporate account',  0),
  (UUID(), 'Shreeji', 'Traders',    '1970-01-01', 'male',   '3, Ring Road',        'Ahmedabad', 'Gujarat',       '24', 'billing@shreeji.example.com',    '9876543229', '24SHREE9876F2X1', 'SHREE9876F', 'Wholesale',          0);

-- =============================================
-- Metal rates — last 30 days AM+PM for 5 gold purities + silver
--
-- Rates deterministically wobble around a domain-realistic 2026-era base:
--   999  ≈ ₹7,800/g, 916 ≈ ₹7,150/g, 875 ≈ ₹6,825/g,
--   750  ≈ ₹5,850/g, 585 ≈ ₹4,560/g, silver 999 ≈ ₹95/g.
-- The RAND(seed) call is seeded per row so the seed is reproducible.
-- =============================================
INSERT INTO `metalrates` (effectiveDate, session, purityCode, ratePerGram, source)
WITH RECURSIVE days (n) AS (
  SELECT 0
  UNION ALL
  SELECT n + 1 FROM days WHERE n < 29
),
sessions (session) AS (
  SELECT 'AM' UNION ALL SELECT 'PM'
),
purities_base (code, base) AS (
  SELECT '999',  7800 UNION ALL
  SELECT '916',  7150 UNION ALL
  SELECT '875',  6825 UNION ALL
  SELECT '750',  5850 UNION ALL
  SELECT '585',  4560 UNION ALL
  SELECT 'S999',   95
)
SELECT
  DATE_SUB(CURDATE(), INTERVAL n DAY) AS effectiveDate,
  session,
  code AS purityCode,
  ROUND(base * (1 + (RAND(n * 100 + IF(session = 'PM', 2, 1) + CRC32(code) MOD 97) - 0.5) * 0.03), 2) AS ratePerGram,
  'manual' AS source
FROM days
CROSS JOIN sessions
CROSS JOIN purities_base;

-- =============================================
-- Products
--
-- SKU convention: <MetalCode>-<Category3>-<NNN>
--   G = Gold, S = Silver
--   NEC = Necklace, RIN = Ring, EAR = Earring, BRA = Bracelet,
--   PEN = Pendant, ANK = Anklet
--
-- HUIDs are 6-character alphanumerics; only mandatory on hallmarked
-- gold, so silver / lightweight items may omit them.
-- =============================================
INSERT INTO `products`
  (productGuid, sku, huid, purityCode, productDescription, grossWeight, netWeight,
   stoneWeight, stoneCharges, makingMode, makingValue, wastagePercent,
   costPrice, tagPrice, hsnCode, isSold, mid, sid, pid)
VALUES
  -- 22K gold necklaces
  (UUID(), 'G-NEC-001', 'AB12CD', '916', '22K Gold Traditional Temple Necklace',      18.500, 17.800, 0.700,  1500.00, 'perGram',   450.00, 3.00,  115000.00, 148000.00, '7113', 0, 1, 1, 1),
  (UUID(), 'G-NEC-002', 'AB13CE', '916', '22K Gold Bridal Choker with kundan',        26.400, 24.900, 1.500,  4800.00, 'percent',    12.00, 5.00,  180000.00, 232000.00, '7113', 0, 1, 4, 1),
  (UUID(), 'G-NEC-003', 'AB14CF', '916', '22K Gold Rani Haar',                        42.100, 40.800, 1.300,  3200.00, 'perGram',   520.00, 4.00,  295000.00, 375000.00, '7113', 0, 1, 3, 1),
  (UUID(), 'G-NEC-004', 'AB15CG', '916', '22K Gold Byzantine Chain',                  22.000, 22.000, 0.000,     0.00, 'perGram',   380.00, 2.50,  150000.00, 190000.00, '7113', 0, 1, 2, 1),
  (UUID(), 'G-NEC-005', 'AB16CH', '750', '18K Gold Modern Layered Necklace',          12.400, 12.400, 0.000,     0.00, 'percent',    14.00, 3.00,   70000.00,  92000.00, '7113', 0, 1, 2, 1),
  -- 22K gold rings
  (UUID(), 'G-RIN-001', 'AC21DA', '916', '22K Gold Traditional Signet Ring',           7.200,  7.000, 0.200,   450.00, 'perGram',   380.00, 3.00,   45000.00,  58000.00, '7113', 0, 1, 1, 2),
  (UUID(), 'G-RIN-002', 'AC22DB', '750', '18K Gold Solitaire Ring (CZ)',               5.400,  4.900, 0.500,  1200.00, 'flat',     6000.00, 0.00,   38000.00,  52000.00, '7113', 0, 1, 2, 2),
  (UUID(), 'G-RIN-003', 'AC23DC', '750', '18K Gold Diamond Cluster Ring',              4.800,  4.100, 0.700, 12500.00, 'percent',    18.00, 0.00,   64000.00,  85000.00, '7113', 0, 3, 3, 2),
  (UUID(), 'G-RIN-004', 'AC24DD', '750', '18K Gold Engagement Band with diamonds',     6.100,  5.400, 0.700, 18500.00, 'perGram',   700.00, 0.00,   74000.00,  98000.00, '7113', 0, 3, 4, 2),
  (UUID(), 'G-RIN-005', 'AC25DE', '585', '14K Gold Daily Wear Ring',                   3.000,  3.000, 0.000,     0.00, 'perGram',   250.00, 2.00,   15500.00,  20000.00, '7113', 0, 1, 5, 2),
  -- 22K gold earrings
  (UUID(), 'G-EAR-001', 'AD31EA', '916', '22K Gold Jhumka with pearl drops',           8.900,  8.400, 0.500,  1400.00, 'perGram',   420.00, 4.00,   55000.00,  71000.00, '7113', 0, 1, 1, 3),
  (UUID(), 'G-EAR-002', 'AD32EB', '916', '22K Gold Chandbali Earrings',               12.200, 11.700, 0.500,  2100.00, 'percent',    13.00, 5.00,   82000.00, 105000.00, '7113', 0, 1, 3, 3),
  (UUID(), 'G-EAR-003', 'AD33EC', '750', '18K Gold Stud Earrings (CZ)',                3.400,  3.100, 0.300,   800.00, 'flat',     3500.00, 0.00,   22000.00,  29500.00, '7113', 0, 1, 5, 3),
  (UUID(), 'G-EAR-004', 'AD34ED', '750', '18K Gold Diamond Hoop Earrings',             5.200,  4.700, 0.500,  9800.00, 'perGram',   620.00, 0.00,   48000.00,  64000.00, '7113', 0, 3, 2, 3),
  (UUID(), 'G-EAR-005', 'AD35EE', '916', '22K Gold Bali Earrings',                     6.800,  6.800, 0.000,     0.00, 'perGram',   360.00, 3.00,   43000.00,  55500.00, '7113', 0, 1, 2, 3),
  -- 22K gold bracelets / bangles
  (UUID(), 'G-BRA-001', 'AE41FA', '916', '22K Gold Traditional Bangle Pair',          21.500, 21.500, 0.000,     0.00, 'perGram',   410.00, 3.50,  140000.00, 178000.00, '7113', 0, 1, 1, 4),
  (UUID(), 'G-BRA-002', 'AE42FB', '916', '22K Gold Kada with cutwork',                18.400, 18.000, 0.400,  1200.00, 'percent',    14.00, 4.00,  120000.00, 152000.00, '7113', 0, 1, 3, 4),
  (UUID(), 'G-BRA-003', 'AE43FC', '750', '18K Gold Modern Chain Bracelet',             9.600,  9.600, 0.000,     0.00, 'perGram',   380.00, 2.50,   58000.00,  74000.00, '7113', 0, 1, 2, 4),
  (UUID(), 'G-BRA-004', 'AE44FD', '750', '18K Gold Tennis Bracelet (diamonds)',        8.500,  7.200, 1.300, 24000.00, 'percent',    16.00, 0.00,   96000.00, 128000.00, '7113', 0, 3, 2, 4),
  -- 22K gold pendants
  (UUID(), 'G-PEN-001', 'AF51GA', '916', '22K Gold Ganesha Pendant',                   4.200,  4.000, 0.200,   600.00, 'perGram',   380.00, 3.00,   26000.00,  33500.00, '7113', 0, 1, 1, 5),
  (UUID(), 'G-PEN-002', 'AF52GB', '750', '18K Gold Diamond Heart Pendant',             3.100,  2.700, 0.400,  7200.00, 'flat',     4500.00, 0.00,   28000.00,  37500.00, '7113', 0, 3, 2, 5),
  (UUID(), 'G-PEN-003', 'AF53GC', '916', '22K Gold Om Pendant',                        3.600,  3.600, 0.000,     0.00, 'perGram',   360.00, 3.00,   22500.00,  28500.00, '7113', 0, 1, 1, 5),
  (UUID(), 'G-PEN-004', 'AF54GD', '585', '14K Gold Initial Pendant "S"',               2.100,  2.100, 0.000,     0.00, 'flat',     1500.00, 0.00,   10500.00,  13500.00, '7113', 0, 1, 2, 5),
  -- Gold anklets (unusual — but possible)
  (UUID(), 'G-ANK-001', 'AG61HA', '916', '22K Gold Payal with ghungroo',              14.800, 14.400, 0.400,   500.00, 'perGram',   360.00, 3.00,   94000.00, 120000.00, '7113', 0, 1, 1, 6),
  (UUID(), 'G-ANK-002', 'AG62HB', '750', '18K Gold Anklet Pair (modern)',              9.200,  9.200, 0.000,     0.00, 'perGram',   320.00, 2.50,   55000.00,  70000.00, '7113', 0, 1, 2, 6),
  -- 24K gold (999)
  (UUID(), 'G-COIN-01', 'AH71IA', '999', '24K Gold Coin (10g Lakshmi)',               10.000, 10.000, 0.000,     0.00, 'flat',      750.00, 0.00,   77000.00,  81500.00, '7118', 0, 1, 5, 5),
  (UUID(), 'G-COIN-02', 'AH72IB', '999', '24K Gold Coin (5g)',                         5.000,  5.000, 0.000,     0.00, 'flat',      500.00, 0.00,   38500.00,  40500.00, '7118', 0, 1, 5, 5),
  -- Silver
  (UUID(), 'S-NEC-001', NULL,     'S999', 'Silver Antique Tribal Necklace',           45.500, 43.800, 1.700,  1200.00, 'perGram',    25.00, 3.00,    5000.00,   6800.00, '7113', 0, 2, 3, 1),
  (UUID(), 'S-NEC-002', NULL,     'S999', 'Silver Modern Bead Necklace',              28.000, 27.400, 0.600,   400.00, 'perGram',    22.00, 3.00,    3000.00,   4100.00, '7113', 0, 2, 2, 1),
  (UUID(), 'S-RIN-001', NULL,     'S999', 'Silver Traditional Toe Ring Set',          10.250, 10.100, 0.150,   150.00, 'flat',      250.00, 0.00,    1100.00,   1500.00, '7113', 0, 2, 1, 2),
  (UUID(), 'S-EAR-001', NULL,     'S999', 'Silver Oxidized Jhumka Earrings',          30.000, 29.400, 0.600,   350.00, 'perGram',    22.00, 3.00,    3300.00,   4500.00, '7113', 0, 2, 3, 3),
  (UUID(), 'S-EAR-002', NULL,     'S999', 'Silver Modern Hoop Earrings',              12.400, 12.400, 0.000,     0.00, 'perGram',    18.00, 2.00,    1300.00,   1800.00, '7113', 0, 2, 2, 3),
  (UUID(), 'S-BRA-001', NULL,     'S999', 'Silver Modern Cuff Bracelet',              20.000, 20.000, 0.000,     0.00, 'perGram',    20.00, 2.50,    2100.00,   2900.00, '7113', 0, 2, 2, 4),
  (UUID(), 'S-BRA-002', NULL,     'S999', 'Silver Kada with etched pattern',          32.500, 32.500, 0.000,     0.00, 'perGram',    24.00, 3.00,    3500.00,   4700.00, '7113', 0, 2, 1, 4),
  (UUID(), 'S-PEN-001', NULL,     'S999', 'Silver Filigree Pendant',                  15.750, 15.500, 0.250,   200.00, 'perGram',    22.00, 3.00,    1700.00,   2300.00, '7113', 0, 2, 3, 5),
  (UUID(), 'S-ANK-001', NULL,     'S999', 'Silver Daily Wear Anklet',                 35.000, 35.000, 0.000,     0.00, 'perGram',    20.00, 2.50,    3700.00,   5000.00, '7113', 0, 2, 5, 6),
  (UUID(), 'S-ANK-002', NULL,     'S999', 'Silver Bridal Anklet with ghungroo',       48.000, 47.000, 1.000,   500.00, 'percent',    12.00, 3.00,    5200.00,   7100.00, '7113', 0, 2, 4, 6),
  -- A few more gold items to bring us into the 40+ range
  (UUID(), 'G-NEC-006', 'AB17CI', '916', '22K Gold Mangalsutra',                       9.800,  9.600, 0.200,   400.00, 'perGram',   400.00, 3.50,   62000.00,  79500.00, '7113', 0, 1, 4, 1),
  (UUID(), 'G-NEC-007', 'AB18CJ', '750', '18K Gold Diamond Bridal Necklace',          14.200, 12.900, 1.300, 32000.00, 'percent',    18.00, 0.00,  140000.00, 185000.00, '7113', 0, 3, 4, 1),
  (UUID(), 'G-RIN-006', 'AC26DF', '916', '22K Gold Nose Ring',                         1.200,  1.200, 0.000,     0.00, 'flat',      800.00, 0.00,    8000.00,  10200.00, '7113', 0, 1, 1, 2),
  (UUID(), 'G-EAR-006', 'AD36EF', '585', '14K Gold Daily Wear Studs',                  1.800,  1.800, 0.000,     0.00, 'flat',     1200.00, 0.00,    8500.00,  11000.00, '7113', 0, 1, 5, 3),
  (UUID(), 'G-BRA-005', 'AE45FE', '916', '22K Gold Baby Bangle Set',                   8.400,  8.400, 0.000,     0.00, 'perGram',   380.00, 3.00,   53000.00,  67500.00, '7113', 0, 1, 1, 4),
  (UUID(), 'G-PEN-005', 'AF55GE', '916', '22K Gold Peacock Pendant',                   5.000,  4.800, 0.200,   500.00, 'percent',    12.00, 3.00,   31500.00,  40500.00, '7113', 0, 1, 3, 5);

-- =============================================
-- Test invoices (5-8 spread across the last month)
--
-- Rate assumptions used for calculating line values:
--   916 @ ₹7,150/g   750 @ ₹5,850/g   S999 @ ₹95/g
-- All customers below share Mumbai state (Maharashtra 27) so we split
-- as CGST+SGST. Discount rounded to whole rupees.
-- =============================================

-- Invoice 1: Aarav Sharma buys a 22K necklace (product 1) — intra-state
INSERT INTO `invoices`
  (invoiceGuid, invoiceNumber, hsn, placeOfSupply, rateSnapshot,
   subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount,
   totalMakingCharge, totalStoneCharge, totalWastageCharge,
   oldGoldCreditAmount, roundOffAmount, grandTotal, isPaymentDone,
   remarks, soldToCustomer, createdAt)
VALUES
  (UUID(), 'RAD/2026/00001', '7113', 'Maharashtra',
   JSON_OBJECT('916', 7150, '750', 5850, 'S999', 95),
   140020.00, 2100.30, 2100.30, 0.00, 2000.00,
   8010.00, 1500.00, 3819.00, 0.00, 0.40, 144221.00, 1,
   'Traditional 22K temple necklace', 1, DATE_SUB(NOW(), INTERVAL 26 DAY));

INSERT INTO `invoicelineitems`
  (invoiceId, productId, lineType, description, hsnCode, purityCode,
   grossWeight, netWeight, stoneWeight, ratePerGram, metalValue,
   makingCharge, stoneCharge, wastageCharge, discountAmount,
   taxableAmount, cgst, sgst, igst, lineTotal)
VALUES
  (LAST_INSERT_ID(), 1, 'product', '22K Gold Traditional Temple Necklace', '7113', '916',
   18.500, 17.800, 0.700, 7150.00, 127270.00, 8010.00, 1500.00, 3819.00, 2000.00,
   138599.00, 2078.99, 2078.99, 0.00, 142756.98);

UPDATE `products` SET isSold = 1 WHERE id = 1;

INSERT INTO `payments` (paymentGuid, amount, paymentType, refNumber, remarks, invoiceId)
VALUES (UUID(), 144221.00, 'upi', 'UPI-9182734', 'Paid via GPay',
        (SELECT id FROM invoices WHERE invoiceNumber = 'RAD/2026/00001'));

-- Invoice 2: Priya Patel buys a jhumka + a modern chain — intra-state (Telangana, so IGST)
INSERT INTO `invoices`
  (invoiceGuid, invoiceNumber, hsn, placeOfSupply, rateSnapshot,
   subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount,
   totalMakingCharge, totalStoneCharge, totalWastageCharge,
   oldGoldCreditAmount, roundOffAmount, grandTotal, isPaymentDone,
   remarks, soldToCustomer, createdAt)
VALUES
  (UUID(), 'RAD/2026/00002', '7113', 'Telangana',
   JSON_OBJECT('916', 7145, '750', 5852, 'S999', 94),
   134240.00, 0.00, 0.00, 4027.20, 1000.00,
   6656.00, 1400.00, 2402.00, 0.00, 0.80, 138268.00, 1,
   'Jhumka + chain', 2, DATE_SUB(NOW(), INTERVAL 22 DAY));

INSERT INTO `invoicelineitems`
  (invoiceId, productId, lineType, description, hsnCode, purityCode,
   grossWeight, netWeight, stoneWeight, ratePerGram, metalValue,
   makingCharge, stoneCharge, wastageCharge, discountAmount,
   taxableAmount, cgst, sgst, igst, lineTotal)
VALUES
  (LAST_INSERT_ID(), 11, 'product', '22K Gold Jhumka with pearl drops', '7113', '916',
    8.900,  8.400, 0.500, 7145.00,  60018.00, 3528.00, 1400.00, 2400.72, 500.00,
    66846.72, 0.00, 0.00, 2005.40, 68852.12),
  (LAST_INSERT_ID(), 4,  'product', '22K Gold Byzantine Chain',        '7113', '916',
   22.000, 22.000, 0.000, 7145.00, 157190.00, 3128.00,    0.00,       0.00, 500.00,
   67393.28, 0.00, 0.00, 2021.80, 69415.08);

UPDATE `products` SET isSold = 1 WHERE id IN (4, 11);

INSERT INTO `payments` (paymentGuid, amount, paymentType, refNumber, remarks, invoiceId)
VALUES (UUID(), 138268.00, 'online', 'NEFT-9282918', 'Bank transfer',
        (SELECT id FROM invoices WHERE invoiceNumber = 'RAD/2026/00002'));

-- Invoice 3: Rohan Mehta buys a 18K solitaire ring — inter-state (Delhi)
INSERT INTO `invoices`
  (invoiceGuid, invoiceNumber, hsn, placeOfSupply, rateSnapshot,
   subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount,
   totalMakingCharge, totalStoneCharge, totalWastageCharge,
   oldGoldCreditAmount, roundOffAmount, grandTotal, isPaymentDone,
   remarks, soldToCustomer, createdAt)
VALUES
  (UUID(), 'RAD/2026/00003', '7113', 'Delhi',
   JSON_OBJECT('916', 7160, '750', 5860, 'S999', 96),
   36914.00, 0.00, 0.00, 1107.42, 500.00,
   6000.00, 1200.00, 0.00, 0.00, -0.42, 38021.00, 1,
   'Solitaire engagement ring', 3, DATE_SUB(NOW(), INTERVAL 18 DAY));

INSERT INTO `invoicelineitems`
  (invoiceId, productId, lineType, description, hsnCode, purityCode,
   grossWeight, netWeight, stoneWeight, ratePerGram, metalValue,
   makingCharge, stoneCharge, wastageCharge, discountAmount,
   taxableAmount, cgst, sgst, igst, lineTotal)
VALUES
  (LAST_INSERT_ID(), 7, 'product', '18K Gold Solitaire Ring (CZ)', '7113', '750',
   5.400, 4.900, 0.500, 5860.00, 28714.00, 6000.00, 1200.00, 0.00, 500.00,
   35414.00, 0.00, 0.00, 1062.42, 36476.42);

UPDATE `products` SET isSold = 1 WHERE id = 7;

INSERT INTO `payments` (paymentGuid, amount, paymentType, refNumber, remarks, invoiceId)
VALUES (UUID(), 38021.00, 'card', 'CARD-8291-3812', 'Visa credit',
        (SELECT id FROM invoices WHERE invoiceNumber = 'RAD/2026/00003'));

-- Invoice 4: Ananya Reddy buys a silver necklace + oxidized jhumkas — inter-state
INSERT INTO `invoices`
  (invoiceGuid, invoiceNumber, hsn, placeOfSupply, rateSnapshot,
   subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount,
   totalMakingCharge, totalStoneCharge, totalWastageCharge,
   oldGoldCreditAmount, roundOffAmount, grandTotal, isPaymentDone,
   remarks, soldToCustomer, createdAt)
VALUES
  (UUID(), 'RAD/2026/00004', '7113', 'Karnataka',
   JSON_OBJECT('916', 7140, '750', 5840, 'S999', 95),
   10520.00, 0.00, 0.00, 315.60, 200.00,
   1741.00, 1550.00, 269.00, 0.00, 0.40, 10836.00, 1,
   'Silver necklace + jhumkas', 4, DATE_SUB(NOW(), INTERVAL 15 DAY));

INSERT INTO `invoicelineitems`
  (invoiceId, productId, lineType, description, hsnCode, purityCode,
   grossWeight, netWeight, stoneWeight, ratePerGram, metalValue,
   makingCharge, stoneCharge, wastageCharge, discountAmount,
   taxableAmount, cgst, sgst, igst, lineTotal)
VALUES
  (LAST_INSERT_ID(), 28, 'product', 'Silver Antique Tribal Necklace',   '7113', 'S999',
   45.500, 43.800, 1.700, 95.00, 4161.00, 1095.00, 1200.00, 124.83, 100.00,
    6480.83, 0.00, 0.00, 194.42, 6675.25),
  (LAST_INSERT_ID(), 31, 'product', 'Silver Oxidized Jhumka Earrings',  '7113', 'S999',
   30.000, 29.400, 0.600, 95.00, 2793.00,  646.80,  350.00,  83.79, 100.00,
    3772.59, 0.00, 0.00, 113.18, 3885.77);

UPDATE `products` SET isSold = 1 WHERE id IN (28, 31);

INSERT INTO `payments` (paymentGuid, amount, paymentType, refNumber, remarks, invoiceId)
VALUES (UUID(), 10836.00, 'cash', NULL, 'Full cash payment',
        (SELECT id FROM invoices WHERE invoiceNumber = 'RAD/2026/00004'));

-- Invoice 5: Karan Malhotra buys diamond hoops — inter-state (Chandigarh), partial payment
INSERT INTO `invoices`
  (invoiceGuid, invoiceNumber, hsn, placeOfSupply, rateSnapshot,
   subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount,
   totalMakingCharge, totalStoneCharge, totalWastageCharge,
   oldGoldCreditAmount, roundOffAmount, grandTotal, isPaymentDone,
   remarks, soldToCustomer, createdAt)
VALUES
  (UUID(), 'RAD/2026/00005', '7113', 'Chandigarh',
   JSON_OBJECT('916', 7180, '750', 5880, 'S999', 96),
   61428.00, 0.00, 0.00, 1842.84, 1500.00,
   2914.00, 9800.00, 0.00, 0.00, 0.16, 63271.00, 0,
   'Diamond hoops - EMI 40% down', 11, DATE_SUB(NOW(), INTERVAL 10 DAY));

INSERT INTO `invoicelineitems`
  (invoiceId, productId, lineType, description, hsnCode, purityCode,
   grossWeight, netWeight, stoneWeight, ratePerGram, metalValue,
   makingCharge, stoneCharge, wastageCharge, discountAmount,
   taxableAmount, cgst, sgst, igst, lineTotal)
VALUES
  (LAST_INSERT_ID(), 14, 'product', '18K Gold Diamond Hoop Earrings', '7113', '750',
   5.200, 4.700, 0.500, 5880.00, 27636.00, 2914.00, 9800.00, 0.00, 1500.00,
   38850.00, 0.00, 0.00, 1165.50, 40015.50);

UPDATE `products` SET isSold = 1 WHERE id = 14;

INSERT INTO `payments` (paymentGuid, amount, paymentType, refNumber, remarks, invoiceId)
VALUES (UUID(), 25000.00, 'upi', 'UPI-3312991', '40% down payment',
        (SELECT id FROM invoices WHERE invoiceNumber = 'RAD/2026/00005'));

-- Invoice 6: Manish Kulkarni buys a mangalsutra — intra-state (Maharashtra)
INSERT INTO `invoices`
  (invoiceGuid, invoiceNumber, hsn, placeOfSupply, rateSnapshot,
   subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount,
   totalMakingCharge, totalStoneCharge, totalWastageCharge,
   oldGoldCreditAmount, roundOffAmount, grandTotal, isPaymentDone,
   remarks, soldToCustomer, createdAt)
VALUES
  (UUID(), 'RAD/2026/00006', '7113', 'Maharashtra',
   JSON_OBJECT('916', 7170, '750', 5870, 'S999', 96),
   72400.00, 1086.00, 1086.00, 0.00, 500.00,
   3840.00, 400.00, 2408.00, 0.00, 0.00, 74572.00, 1,
   'Anniversary mangalsutra', 13, DATE_SUB(NOW(), INTERVAL 7 DAY));

INSERT INTO `invoicelineitems`
  (invoiceId, productId, lineType, description, hsnCode, purityCode,
   grossWeight, netWeight, stoneWeight, ratePerGram, metalValue,
   makingCharge, stoneCharge, wastageCharge, discountAmount,
   taxableAmount, cgst, sgst, igst, lineTotal)
VALUES
  (LAST_INSERT_ID(), 40, 'product', '22K Gold Mangalsutra', '7113', '916',
   9.800, 9.600, 0.200, 7170.00, 68832.00, 3840.00, 400.00, 2409.12, 500.00,
   74981.12, 1124.72, 1124.72, 0.00, 77230.56);

UPDATE `products` SET isSold = 1 WHERE id = 40;

INSERT INTO `payments` (paymentGuid, amount, paymentType, refNumber, remarks, invoiceId)
VALUES (UUID(), 74572.00, 'online', 'NEFT-7182391', 'Bank transfer',
        (SELECT id FROM invoices WHERE invoiceNumber = 'RAD/2026/00006'));

-- Invoice 7: Divya Enterprises (B2B, intra-state Mumbai) — coin purchase
INSERT INTO `invoices`
  (invoiceGuid, invoiceNumber, hsn, placeOfSupply, rateSnapshot,
   subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount,
   totalMakingCharge, totalStoneCharge, totalWastageCharge,
   oldGoldCreditAmount, roundOffAmount, grandTotal, isPaymentDone,
   remarks, soldToCustomer, createdAt)
VALUES
  (UUID(), 'RAD/2026/00007', '7118', 'Maharashtra',
   JSON_OBJECT('999', 7810, '916', 7170, '750', 5870, 'S999', 96),
   78850.00, 1182.75, 1182.75, 0.00, 0.00,
   750.00, 0.00, 0.00, 0.00, 0.50, 81216.00, 1,
   'B2B — 10g Lakshmi coin', 19, DATE_SUB(NOW(), INTERVAL 4 DAY));

INSERT INTO `invoicelineitems`
  (invoiceId, productId, lineType, description, hsnCode, purityCode,
   grossWeight, netWeight, stoneWeight, ratePerGram, metalValue,
   makingCharge, stoneCharge, wastageCharge, discountAmount,
   taxableAmount, cgst, sgst, igst, lineTotal)
VALUES
  (LAST_INSERT_ID(), 26, 'product', '24K Gold Coin (10g Lakshmi)', '7118', '999',
   10.000, 10.000, 0.000, 7810.00, 78100.00, 750.00, 0.00, 0.00, 0.00,
   78850.00, 1182.75, 1182.75, 0.00, 81215.50);

UPDATE `products` SET isSold = 1 WHERE id = 26;

INSERT INTO `payments` (paymentGuid, amount, paymentType, refNumber, remarks, invoiceId)
VALUES (UUID(), 81216.00, 'cheque', 'CHQ-102938', 'Divya Enterprises cheque',
        (SELECT id FROM invoices WHERE invoiceNumber = 'RAD/2026/00007'));

-- Invoice 8: Sanjay Deshmukh buys a bangle pair with old-gold exchange
INSERT INTO `invoices`
  (invoiceGuid, invoiceNumber, hsn, placeOfSupply, rateSnapshot,
   subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount,
   totalMakingCharge, totalStoneCharge, totalWastageCharge,
   oldGoldCreditAmount, roundOffAmount, grandTotal, isPaymentDone,
   remarks, soldToCustomer, createdAt)
VALUES
  (UUID(), 'RAD/2026/00008', '7113', 'Maharashtra',
   JSON_OBJECT('916', 7175, '750', 5875, 'S999', 96),
   161207.00, 2418.11, 2418.11, 0.00, 3000.00,
   8815.00, 0.00, 5391.00, 62000.00, 0.78, 104044.00, 0,
   'Bangle pair with 8g 916 old-gold exchange', 15, DATE_SUB(NOW(), INTERVAL 2 DAY));

INSERT INTO `invoicelineitems`
  (invoiceId, productId, lineType, description, hsnCode, purityCode,
   grossWeight, netWeight, stoneWeight, ratePerGram, metalValue,
   makingCharge, stoneCharge, wastageCharge, discountAmount,
   taxableAmount, cgst, sgst, igst, lineTotal)
VALUES
  (LAST_INSERT_ID(), 16, 'product', '22K Gold Traditional Bangle Pair', '7113', '916',
   21.500, 21.500, 0.000, 7175.00, 154262.50, 8815.00, 0.00, 5391.00, 3000.00,
   165468.50, 2482.03, 2482.03, 0.00, 170432.56);

UPDATE `products` SET isSold = 1 WHERE id = 16;

INSERT INTO `oldgoldreceipts`
  (receiptGuid, invoiceId, customerId, grossWeight, testedPurityCode,
   testedPurityPercent, deductionPercent, ratePerGram, creditAmount, remarks)
VALUES
  (UUID(),
   (SELECT id FROM invoices WHERE invoiceNumber = 'RAD/2026/00008'),
   15, 8.000, '916', 91.60, 3.00, 7175.00, 62000.00,
   'Old chain — tested and reused');

INSERT INTO `payments` (paymentGuid, amount, paymentType, refNumber, remarks, invoiceId)
VALUES (UUID(), 50000.00, 'upi', 'UPI-4412998', 'Partial — remainder pending',
        (SELECT id FROM invoices WHERE invoiceNumber = 'RAD/2026/00008'));

-- Fast-forward the invoice counter past the 8 seeded invoices
UPDATE `shopsettings` SET currentInvoiceCounter = 9 WHERE id = 1;

-- =============================================
-- Additional Old-gold receipts (unlinked, plus a few more linked to invoices)
-- =============================================
INSERT INTO `oldgoldreceipts`
  (receiptGuid, invoiceId, customerId, grossWeight, testedPurityCode,
   testedPurityPercent, deductionPercent, ratePerGram, creditAmount, remarks)
VALUES
  (UUID(), NULL, 1,  6.500, '916', 91.60, 3.00, 7150.00, 46475.00, 'Old bangle - awaiting invoice'),
  (UUID(), NULL, 5, 12.000, '750', 75.00, 4.00, 5850.00, 70200.00, 'Broken chain'),
  (UUID(),
   (SELECT id FROM invoices WHERE invoiceNumber = 'RAD/2026/00002'),
   2, 3.000, '916', 91.60, 3.00, 7145.00, 21435.00, 'Small earring exchange');
UPDATE invoices
   SET oldGoldCreditAmount = oldGoldCreditAmount + 21435.00
 WHERE invoiceNumber = 'RAD/2026/00002';

-- =============================================
-- Karigars
-- =============================================
INSERT INTO `karigars` (karigarGuid, name, phone, address, remarks) VALUES
  (UUID(), 'Ramesh Sonar',    '9820011122', 'Bhuleshwar Lane, Mumbai',   'Bangles + chains specialist'),
  (UUID(), 'Suresh Karigar',  '9820022233', 'Zaveri Bazaar, Mumbai',     'Setting + polish'),
  (UUID(), 'Mahesh Patel',    '9820033344', 'Kalbadevi Rd, Mumbai',      'Filigree work'),
  (UUID(), 'Deepak Jangid',   '9820044455', 'Sector 21, Jaipur',         'Kundan / meenakari'),
  (UUID(), 'Nitin Chhipa',    '9820055566', 'Choti Chaupar, Jaipur',     'Diamond setting'),
  (UUID(), 'Kishan Bhai',     '9820066677', 'Manek Chowk, Ahmedabad',    'Weight-work specialist'),
  (UUID(), 'Prakash Meena',   '9820077788', 'Johri Bazaar, Jaipur',      'Signet + stamping');

-- =============================================
-- Karigar job cards (spanning last 60 days)
-- =============================================
INSERT INTO `karigarjobcards`
  (jobGuid, karigarId, issueDate, expectedReturnDate, receivedDate,
   issuedGrossWeight, issuedPurityCode, issuedStones,
   receivedGrossWeight, receivedNetWeight, receivedStoneWeight,
   wastagePercentAllowed, wastageGramsActual, makingCharge,
   settlementAmount, settlementPaymentMode, settledAt,
   description, status)
VALUES
  (UUID(), 1, DATE_SUB(CURDATE(), INTERVAL 55 DAY), DATE_SUB(CURDATE(), INTERVAL 45 DAY), DATE_SUB(CURDATE(), INTERVAL 44 DAY),
   50.000, '916', NULL,
   48.850, 48.850, 0.000, 3.00, 1.150, 22000.00,
   22000.00, 'cash', DATE_SUB(CURDATE(), INTERVAL 43 DAY),
   '22K bangle pair — 25g each', 'settled'),
  (UUID(), 2, DATE_SUB(CURDATE(), INTERVAL 48 DAY), DATE_SUB(CURDATE(), INTERVAL 40 DAY), DATE_SUB(CURDATE(), INTERVAL 39 DAY),
   30.000, '916', JSON_ARRAY(JSON_OBJECT('stoneType', 'ruby', 'weight', 0.5, 'value', 4000)),
   28.700, 28.200, 0.500, 4.00, 1.300, 15500.00,
   15500.00, 'online', DATE_SUB(CURDATE(), INTERVAL 38 DAY),
   'Necklace setting with ruby drops', 'settled'),
  (UUID(), 3, DATE_SUB(CURDATE(), INTERVAL 35 DAY), DATE_SUB(CURDATE(), INTERVAL 28 DAY), DATE_SUB(CURDATE(), INTERVAL 27 DAY),
   18.500, '916', NULL,
   17.800, 17.800, 0.000, 4.00, 0.700, 8500.00,
   0.00, NULL, NULL,
   'Filigree pendant chain', 'received'),
  (UUID(), 4, DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_SUB(CURDATE(), INTERVAL 20 DAY), DATE_SUB(CURDATE(), INTERVAL 18 DAY),
   42.000, '916', JSON_ARRAY(JSON_OBJECT('stoneType', 'kundan', 'weight', 2.0, 'value', 12000)),
   39.900, 37.900, 2.000, 5.00, 2.100, 28000.00,
   28000.00, 'online', DATE_SUB(CURDATE(), INTERVAL 15 DAY),
   'Bridal kundan choker', 'settled'),
  (UUID(), 5, DATE_SUB(CURDATE(), INTERVAL 22 DAY), DATE_SUB(CURDATE(), INTERVAL 14 DAY), DATE_SUB(CURDATE(), INTERVAL 12 DAY),
   12.000, '750', JSON_ARRAY(JSON_OBJECT('stoneType', 'diamond', 'weight', 0.8, 'value', 45000)),
   11.400, 10.600, 0.800, 3.00, 0.600, 22500.00,
   22500.00, 'cheque', DATE_SUB(CURDATE(), INTERVAL 10 DAY),
   'Diamond hoop pair', 'settled'),
  (UUID(), 1, DATE_SUB(CURDATE(), INTERVAL 20 DAY), DATE_SUB(CURDATE(), INTERVAL 12 DAY), NULL,
   35.000, '916', NULL,
    0.000, 0.000, 0.000, 3.00, 0.000, 0.00,
    0.00, NULL, NULL,
   'Mangalsutra chain (in progress)', 'issued'),
  (UUID(), 6, DATE_SUB(CURDATE(), INTERVAL 18 DAY), DATE_SUB(CURDATE(), INTERVAL 8 DAY), DATE_SUB(CURDATE(), INTERVAL 7 DAY),
   65.000, '916', NULL,
   62.500, 62.500, 0.000, 4.00, 2.500, 32000.00,
   0.00, NULL, NULL,
   'Kada set (weight work)', 'received'),
  (UUID(), 2, DATE_SUB(CURDATE(), INTERVAL 14 DAY), DATE_SUB(CURDATE(), INTERVAL 6 DAY), DATE_SUB(CURDATE(), INTERVAL 5 DAY),
    9.500, '750', JSON_ARRAY(JSON_OBJECT('stoneType', 'cz', 'weight', 0.3, 'value', 800)),
    9.100, 8.800, 0.300, 3.00, 0.400, 7800.00,
    5000.00, 'cash', DATE_SUB(CURDATE(), INTERVAL 4 DAY),
   'Solitaire style ring - partial payment', 'settled'),
  (UUID(), 4, DATE_SUB(CURDATE(), INTERVAL 12 DAY), DATE_SUB(CURDATE(), INTERVAL 4 DAY), NULL,
   28.000, '916', JSON_ARRAY(JSON_OBJECT('stoneType', 'polki', 'weight', 1.2, 'value', 18000)),
    0.000, 0.000, 0.000, 5.00, 0.000, 0.00,
    0.00, NULL, NULL,
   'Polki earring pair (in progress)', 'issued'),
  (UUID(), 7, DATE_SUB(CURDATE(), INTERVAL 10 DAY), DATE_SUB(CURDATE(), INTERVAL 3 DAY), DATE_SUB(CURDATE(), INTERVAL 2 DAY),
   14.500, '916', NULL,
   14.000, 14.000, 0.000, 3.00, 0.500, 4800.00,
    0.00, NULL, NULL,
   'Signet ring — traditional stamp', 'received'),
  (UUID(), 3, DATE_SUB(CURDATE(), INTERVAL 8 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), NULL,
    6.000, 'S999', NULL,
    0.000, 0.000, 0.000, 2.50, 0.000, 0.00,
    0.00, NULL, NULL,
   'Silver filigree pendant', 'issued'),
  (UUID(), 5, DATE_SUB(CURDATE(), INTERVAL 6 DAY), CURDATE(), NULL,
   22.000, '750', JSON_ARRAY(JSON_OBJECT('stoneType', 'diamond', 'weight', 1.5, 'value', 85000)),
    0.000, 0.000, 0.000, 3.00, 0.000, 0.00,
    0.00, NULL, NULL,
   'Tennis bracelet - diamond line', 'issued');

-- Karigar ledger entries derived from the job cards above
INSERT INTO `karigarledger`
  (ledgerGuid, karigarId, jobId, entryType, direction, weightGrams, amount, txnDate, notes, actorUserId)
SELECT UUID(), j.karigarId, j.id, 'issue',   'debit',  j.issuedGrossWeight, 0, j.issueDate,
       CONCAT('Metal issued for job ', j.jobGuid), 1
  FROM karigarjobcards j;

INSERT INTO `karigarledger`
  (ledgerGuid, karigarId, jobId, entryType, direction, weightGrams, amount, txnDate, notes, actorUserId)
SELECT UUID(), j.karigarId, j.id, 'receive', 'credit', j.receivedGrossWeight, 0, j.receivedDate,
       CONCAT('Metal received for job ', j.jobGuid), 1
  FROM karigarjobcards j
 WHERE j.receivedDate IS NOT NULL;

INSERT INTO `karigarledger`
  (ledgerGuid, karigarId, jobId, entryType, direction, weightGrams, amount, txnDate, notes, actorUserId)
SELECT UUID(), j.karigarId, j.id, 'adjustment', 'credit', NULL, j.makingCharge, j.receivedDate,
       'Making charge accrued', 1
  FROM karigarjobcards j
 WHERE j.receivedDate IS NOT NULL AND j.makingCharge > 0;

INSERT INTO `karigarledger`
  (ledgerGuid, karigarId, jobId, entryType, direction, weightGrams, amount, txnDate, notes, actorUserId)
SELECT UUID(), j.karigarId, j.id, 'payment', 'debit', NULL, j.settlementAmount, DATE(j.settledAt),
       CONCAT('Settlement ', COALESCE(j.settlementPaymentMode, 'cash')), 1
  FROM karigarjobcards j
 WHERE j.status = 'settled' AND j.settlementAmount > 0;

-- =============================================
-- Saving schemes (mix of statuses)
-- =============================================
INSERT INTO `savingschemes`
  (schemeGuid, customerId, planName, monthlyAmount, tenureMonths, bonusInstallments,
   startDate, expectedMaturityDate, totalPaid, status)
VALUES
  (UUID(), 1,  'Golden Harvest',    5000.00, 11, 1, DATE_SUB(CURDATE(), INTERVAL 5 MONTH), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), INTERVAL 11 MONTH), 25000.00, 'active'),
  (UUID(), 2,  'Silver Sparkle',    3000.00, 11, 1, DATE_SUB(CURDATE(), INTERVAL 3 MONTH), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 3 MONTH), INTERVAL 11 MONTH), 9000.00,  'active'),
  (UUID(), 3,  'Diamond Dream',    10000.00, 11, 1, DATE_SUB(CURDATE(), INTERVAL 4 MONTH), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 4 MONTH), INTERVAL 11 MONTH), 40000.00, 'active'),
  (UUID(), 4,  'Golden Harvest',    5000.00, 11, 1, DATE_SUB(CURDATE(), INTERVAL 12 MONTH), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 12 MONTH), INTERVAL 11 MONTH), 55000.00, 'matured'),
  (UUID(), 5,  'Silver Sparkle',    3000.00, 11, 1, DATE_SUB(CURDATE(), INTERVAL 13 MONTH), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 13 MONTH), INTERVAL 11 MONTH), 33000.00, 'matured'),
  (UUID(), 6,  'Diamond Dream',    10000.00, 11, 1, DATE_SUB(CURDATE(), INTERVAL 2 MONTH), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 2 MONTH), INTERVAL 11 MONTH), 20000.00, 'active'),
  (UUID(), 7,  'Golden Harvest',    5000.00, 11, 1, DATE_SUB(CURDATE(), INTERVAL 6 MONTH), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 6 MONTH), INTERVAL 11 MONTH), 30000.00, 'active'),
  (UUID(), 8,  'Silver Sparkle',    3000.00, 11, 1, DATE_SUB(CURDATE(), INTERVAL 8 MONTH), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 8 MONTH), INTERVAL 11 MONTH), 6000.00,  'forfeited'),
  (UUID(), 9,  'Golden Harvest',    5000.00, 11, 1, DATE_SUB(CURDATE(), INTERVAL 1 MONTH), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), INTERVAL 11 MONTH), 5000.00,  'active'),
  (UUID(), 10, 'Diamond Dream',    10000.00, 11, 1, DATE_SUB(CURDATE(), INTERVAL 4 MONTH), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 4 MONTH), INTERVAL 11 MONTH), 40000.00, 'active');

-- Forfeited scheme reason
UPDATE `savingschemes`
   SET forfeitedAt = DATE_SUB(NOW(), INTERVAL 30 DAY),
       forfeitReason = 'Customer lapsed after 2 installments'
 WHERE customerId = 8;

-- Redeemed scheme: link to existing invoice 1 as a demonstration
UPDATE `savingschemes`
   SET status = 'redeemed',
       redeemedInvoiceId = (SELECT id FROM invoices WHERE invoiceNumber = 'RAD/2026/00001'),
       redeemedAmount    = 60000.00,
       redeemedAt        = DATE_SUB(NOW(), INTERVAL 25 DAY)
 WHERE customerId = 4;

-- Installments matching totalPaid on each scheme (idempotent counts)
INSERT INTO `savingschemeinstallments`
  (installmentGuid, schemeId, installmentNumber, amount, paymentMode, refNumber, receiptDate, actorUserId)
SELECT UUID(),
       s.id,
       n.n,
       s.monthlyAmount,
       ELT(1 + (n.n - 1) MOD 3, 'cash', 'online', 'upi'),
       CASE ELT(1 + (n.n - 1) MOD 3, 'cash', 'online', 'upi')
         WHEN 'cash'   THEN NULL
         WHEN 'online' THEN CONCAT('NEFT-', LPAD(s.id * 100 + n.n, 6, '0'))
         ELSE                CONCAT('UPI-',  LPAD(s.id * 100 + n.n, 6, '0'))
       END,
       DATE_ADD(s.startDate, INTERVAL (n.n - 1) MONTH),
       3
FROM savingschemes s
JOIN (
  SELECT 1 AS n UNION ALL SELECT 2  UNION ALL SELECT 3  UNION ALL SELECT 4  UNION ALL SELECT 5
  UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8  UNION ALL SELECT 9  UNION ALL SELECT 10
  UNION ALL SELECT 11
) n ON n.n <= FLOOR(s.totalPaid / s.monthlyAmount);

