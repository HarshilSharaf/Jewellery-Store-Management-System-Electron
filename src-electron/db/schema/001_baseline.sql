-- =====================================================================
-- SQLite baseline schema (migration version 1) — P1 core
--
-- Ported from Scripts/Tables/*.sql (MySQL) for better-sqlite3.
-- Conventions (see project_sqlite_migration decision):
--   * Money  -> INTEGER paise      (₹1 = 100). Never REAL.
--   * Weight -> INTEGER milligrams (1 g = 1000). Never REAL.
--   * Rates/percentages that are only multipliers -> REAL (exact enough;
--     the *result* is rounded to integer paise at compute time in JS).
--   * ENUM      -> TEXT + CHECK(col IN (...))
--   * TINYINT(1)-> INTEGER + CHECK(col IN (0,1))
--   * JSON      -> TEXT + CHECK(col IS NULL OR json_valid(col))
--   * DATETIME  -> TEXT (ISO-8601, UTC). `updatedAt` maintained by triggers
--                  (SQLite has no ON UPDATE CURRENT_TIMESTAMP).
--   * AUTO_INCREMENT PK -> INTEGER PRIMARY KEY AUTOINCREMENT.
--
-- Tables are declared parent-first so a single transaction with
-- PRAGMA foreign_keys=ON can create + seed them in order.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tier 0 — no outbound foreign keys
-- ---------------------------------------------------------------------

CREATE TABLE purities (
  code       TEXT    NOT NULL PRIMARY KEY,
  label      TEXT    NOT NULL,
  metalType  TEXT    NOT NULL CHECK (metalType IN ('gold','silver','platinum')),
  fineness   INTEGER NOT NULL,
  sortOrder  INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  createdAt  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_purities_metalType ON purities (metalType, sortOrder);

CREATE TABLE users (
  uid             INTEGER PRIMARY KEY AUTOINCREMENT,
  userName        TEXT    NOT NULL,
  email           TEXT    NOT NULL,
  password        TEXT    NOT NULL,
  type            TEXT    NOT NULL,
  permissions     TEXT             CHECK (permissions IS NULL OR json_valid(permissions)),
  imagePath       TEXT,
  created_on      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_date TEXT,
  lastLoginAt     TEXT
);
CREATE UNIQUE INDEX users_email     ON users (email);
CREATE UNIQUE INDEX users_user_name ON users (userName);

CREATE TABLE mastercategories (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  masterCategoryName        TEXT    NOT NULL,
  masterCategoryDescription TEXT,
  createdAt                 TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt                 TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subcategories (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  subCategoryName        TEXT    NOT NULL,
  subCategoryDescription TEXT,
  createdAt              TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt              TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_subCategoryName ON subcategories (subCategoryName);

CREATE TABLE productcategories (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  productCategoryName        TEXT    NOT NULL,
  productCategoryDescription TEXT,
  createdAt                  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt                  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_productCategoryName ON productcategories (productCategoryName);

CREATE TABLE customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customerGuid  TEXT    NOT NULL,
  firstName     TEXT    NOT NULL,
  lastName      TEXT    NOT NULL,
  dateOfBirth   TEXT,
  gender        TEXT    NOT NULL CHECK (gender IN ('male','female')),
  address       TEXT,
  city          TEXT    NOT NULL,
  state         TEXT,
  stateCode     TEXT,
  email         TEXT,
  phoneNumber   TEXT    NOT NULL,
  gstin         TEXT,
  pan           TEXT,
  remarks       TEXT,
  creditBalance INTEGER NOT NULL DEFAULT 0,   -- paise
  imagePath     TEXT,
  createdAt     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deletedAt     TEXT
);
CREATE UNIQUE INDEX uk_customers_customerGuid ON customers (customerGuid);
CREATE UNIQUE INDEX customers_email           ON customers (email);
CREATE INDEX idx_customers_deletedAt_createdAt ON customers (deletedAt, createdAt);
CREATE INDEX idx_customers_phoneNumber         ON customers (phoneNumber);
CREATE INDEX idx_customers_gstin               ON customers (gstin);

CREATE TABLE taxslabs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  hsnCode       TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  cgstRate      REAL    NOT NULL,
  sgstRate      REAL    NOT NULL,
  igstRate      REAL    NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  effectiveFrom TEXT    NOT NULL,
  createdAt     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uk_taxslabs_hsnCode_effectiveFrom ON taxslabs (hsnCode, effectiveFrom);
CREATE INDEX idx_taxslabs_active ON taxslabs (active);

CREATE TABLE shopsettings (
  id                        INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton
  shopName                  TEXT    NOT NULL,
  gstin                     TEXT    NOT NULL,
  pan                       TEXT,
  addressLine1              TEXT    NOT NULL,
  addressLine2              TEXT,
  city                      TEXT    NOT NULL,
  state                     TEXT    NOT NULL,
  stateCode                 TEXT    NOT NULL,
  pincode                   TEXT    NOT NULL,
  phone                     TEXT    NOT NULL,
  email                     TEXT,
  logoPath                  TEXT,
  invoicePrefix             TEXT    NOT NULL DEFAULT 'INV/',
  invoiceStartFrom          INTEGER NOT NULL DEFAULT 1,
  currentInvoiceCounter     INTEGER NOT NULL DEFAULT 1,
  defaultCurrency           TEXT    NOT NULL DEFAULT 'INR',
  timezone                  TEXT    NOT NULL DEFAULT 'Asia/Kolkata',
  roundOffEnabled           INTEGER NOT NULL DEFAULT 1 CHECK (roundOffEnabled IN (0,1)),
  backupDir                 TEXT,
  defaultPrintVariant       TEXT    NOT NULL DEFAULT 'a4' CHECK (defaultPrintVariant IN ('a4','thermal80')),
  repairPrefix              TEXT    NOT NULL DEFAULT 'REP/',
  currentRepairCounter      INTEGER NOT NULL DEFAULT 1,
  whatsappPhoneNumberId     TEXT,
  whatsappBusinessAccountId TEXT,
  whatsappApiToken          TEXT,
  whatsappEnabled           INTEGER NOT NULL DEFAULT 0 CHECK (whatsappEnabled IN (0,1)),
  ibjaAutoFetchEnabled      INTEGER NOT NULL DEFAULT 0 CHECK (ibjaAutoFetchEnabled IN (0,1)),
  typographyPreset          TEXT    NOT NULL DEFAULT 'editorial'
                              CHECK (typographyPreset IN ('editorial','modern_sans','traditional_devanagari','compact')),
  createdAt                 TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt                 TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- Tier 1
-- ---------------------------------------------------------------------

CREATE TABLE products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  productGuid       TEXT    NOT NULL,
  sku               TEXT    NOT NULL,
  huid              TEXT,
  purityCode        TEXT    NOT NULL,
  productDescription TEXT,
  grossWeight       INTEGER NOT NULL,             -- mg
  netWeight         INTEGER NOT NULL,             -- mg
  stoneWeight       INTEGER NOT NULL DEFAULT 0,   -- mg
  stoneCharges      INTEGER NOT NULL DEFAULT 0,   -- paise
  makingMode        TEXT    NOT NULL DEFAULT 'perGram' CHECK (makingMode IN ('flat','perGram','percent')),
  makingValue       INTEGER NOT NULL DEFAULT 0,   -- paise (flat/perGram) — percent uses wastagePercent semantics in JS
  wastagePercent    REAL    NOT NULL DEFAULT 0,
  costPrice         INTEGER NOT NULL DEFAULT 0,   -- paise
  tagPrice          INTEGER NOT NULL DEFAULT 0,   -- paise
  hsnCode           TEXT    NOT NULL DEFAULT '7113',
  imagePath         TEXT,
  isSold            INTEGER NOT NULL DEFAULT 0 CHECK (isSold IN (0,1)),
  createdAt         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deletedAt         TEXT,
  mid               INTEGER NOT NULL,
  sid               INTEGER NOT NULL,
  pid               INTEGER NOT NULL,
  CONSTRAINT fk_products_mastercategories  FOREIGN KEY (mid)        REFERENCES mastercategories  (id) ON UPDATE CASCADE,
  CONSTRAINT fk_products_subcategories     FOREIGN KEY (sid)        REFERENCES subcategories     (id) ON UPDATE CASCADE,
  CONSTRAINT fk_products_productcategories FOREIGN KEY (pid)        REFERENCES productcategories (id) ON UPDATE CASCADE,
  CONSTRAINT fk_products_purities          FOREIGN KEY (purityCode) REFERENCES purities          (code) ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uk_products_productGuid ON products (productGuid);
CREATE UNIQUE INDEX uk_products_sku         ON products (sku);
CREATE UNIQUE INDEX uk_products_huid        ON products (huid);
CREATE INDEX idx_products_mid                 ON products (mid);
CREATE INDEX idx_products_sid                 ON products (sid);
CREATE INDEX idx_products_pid                 ON products (pid);
CREATE INDEX idx_products_purityCode          ON products (purityCode);
CREATE INDEX idx_products_deletedAt_isSold    ON products (deletedAt, isSold);
CREATE INDEX idx_products_deletedAt_createdAt ON products (deletedAt, createdAt);

CREATE TABLE metalrates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  effectiveDate TEXT    NOT NULL,
  session       TEXT    NOT NULL CHECK (session IN ('AM','PM')),
  purityCode    TEXT    NOT NULL,
  ratePerGram   INTEGER NOT NULL,             -- paise per gram
  source        TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ibja')),
  setByUserId   INTEGER,
  createdAt     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_metalrates_purities FOREIGN KEY (purityCode)  REFERENCES purities (code) ON UPDATE CASCADE,
  CONSTRAINT fk_metalrates_users    FOREIGN KEY (setByUserId) REFERENCES users    (uid) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uk_metalrates_date_session_purity ON metalrates (effectiveDate, session, purityCode);
CREATE INDEX idx_metalrates_effectiveDate ON metalrates (effectiveDate);

CREATE TABLE invoices (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  invoiceGuid            TEXT    NOT NULL,
  invoiceNumber          TEXT    NOT NULL,
  hsn                    TEXT    NOT NULL DEFAULT '7113',
  placeOfSupply          TEXT,
  rateSnapshot           TEXT             CHECK (rateSnapshot IS NULL OR json_valid(rateSnapshot)),
  subTotalTaxable        INTEGER NOT NULL DEFAULT 0,  -- paise
  totalCgst              INTEGER NOT NULL DEFAULT 0,  -- paise
  totalSgst              INTEGER NOT NULL DEFAULT 0,  -- paise
  totalIgst              INTEGER NOT NULL DEFAULT 0,  -- paise
  totalDiscount          INTEGER NOT NULL DEFAULT 0,  -- paise
  totalMakingCharge      INTEGER NOT NULL DEFAULT 0,  -- paise
  totalStoneCharge       INTEGER NOT NULL DEFAULT 0,  -- paise
  totalWastageCharge     INTEGER NOT NULL DEFAULT 0,  -- paise
  oldGoldCreditAmount    INTEGER NOT NULL DEFAULT 0,  -- paise
  savingSchemeRedemption TEXT             CHECK (savingSchemeRedemption IS NULL OR json_valid(savingSchemeRedemption)),
  roundOffAmount         INTEGER NOT NULL DEFAULT 0,  -- paise (can be negative)
  grandTotal             INTEGER NOT NULL,            -- paise
  isPaymentDone          INTEGER NOT NULL DEFAULT 0 CHECK (isPaymentDone IN (0,1)),
  isEinvoice             INTEGER NOT NULL DEFAULT 0 CHECK (isEinvoice IN (0,1)),
  irn                    TEXT,
  qrCodeData             TEXT,
  remarks                TEXT,
  createdAt              TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt              TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelledAt            TEXT,
  cancelReason           TEXT,
  soldToCustomer         INTEGER NOT NULL,
  CONSTRAINT fk_invoices_soldToCustomer FOREIGN KEY (soldToCustomer) REFERENCES customers (id) ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uk_invoices_invoiceGuid   ON invoices (invoiceGuid);
CREATE UNIQUE INDEX uk_invoices_invoiceNumber ON invoices (invoiceNumber);
CREATE INDEX idx_invoices_soldToCustomer        ON invoices (soldToCustomer);
CREATE INDEX idx_invoices_cancelledAt_createdAt ON invoices (cancelledAt, createdAt);

-- ---------------------------------------------------------------------
-- Tier 2
-- ---------------------------------------------------------------------

CREATE TABLE invoicelineitems (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  invoiceId      INTEGER NOT NULL,
  productId      INTEGER,
  lineType       TEXT    NOT NULL DEFAULT 'product' CHECK (lineType IN ('product','oldGold','stone','labour')),
  description    TEXT,
  hsnCode        TEXT,
  purityCode     TEXT,
  grossWeight    INTEGER NOT NULL DEFAULT 0,  -- mg
  netWeight      INTEGER NOT NULL DEFAULT 0,  -- mg
  stoneWeight    INTEGER NOT NULL DEFAULT 0,  -- mg
  ratePerGram    INTEGER NOT NULL DEFAULT 0,  -- paise per gram
  metalValue     INTEGER NOT NULL DEFAULT 0,  -- paise
  makingCharge   INTEGER NOT NULL DEFAULT 0,  -- paise
  stoneCharge    INTEGER NOT NULL DEFAULT 0,  -- paise
  wastageCharge  INTEGER NOT NULL DEFAULT 0,  -- paise
  discountAmount INTEGER NOT NULL DEFAULT 0,  -- paise
  taxableAmount  INTEGER NOT NULL DEFAULT 0,  -- paise
  cgst           INTEGER NOT NULL DEFAULT 0,  -- paise
  sgst           INTEGER NOT NULL DEFAULT 0,  -- paise
  igst           INTEGER NOT NULL DEFAULT 0,  -- paise
  lineTotal      INTEGER NOT NULL DEFAULT 0,  -- paise
  createdAt      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoicelineitems_invoice FOREIGN KEY (invoiceId)  REFERENCES invoices (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_invoicelineitems_product FOREIGN KEY (productId)  REFERENCES products (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_invoicelineitems_purity  FOREIGN KEY (purityCode) REFERENCES purities (code) ON UPDATE CASCADE
);
CREATE INDEX idx_invoicelineitems_invoiceId ON invoicelineitems (invoiceId);
CREATE INDEX idx_invoicelineitems_productId ON invoicelineitems (productId);
CREATE INDEX idx_invoicelineitems_lineType  ON invoicelineitems (lineType);

CREATE TABLE payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  paymentGuid  TEXT    NOT NULL,
  amount       INTEGER NOT NULL,   -- paise
  paymentType  TEXT    NOT NULL CHECK (paymentType IN ('cash','cheque','online','upi','card')),
  refNumber    TEXT,
  remarks      TEXT,
  receivedOn   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reconciledAt TEXT,
  updatedAt    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  invoiceId    INTEGER NOT NULL,
  CONSTRAINT fk_payments_invoices FOREIGN KEY (invoiceId) REFERENCES invoices (id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uk_payments_paymentGuid ON payments (paymentGuid);
CREATE INDEX idx_payments_receivedOn ON payments (receivedOn);
CREATE INDEX idx_payments_invoiceId  ON payments (invoiceId);

CREATE TABLE oldgoldreceipts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  receiptGuid         TEXT    NOT NULL,
  invoiceId           INTEGER,
  customerId          INTEGER NOT NULL,
  grossWeight         INTEGER NOT NULL,             -- mg
  testedPurityCode    TEXT,
  testedPurityPercent REAL,
  deductionPercent    REAL    NOT NULL DEFAULT 0,
  ratePerGram         INTEGER NOT NULL,             -- paise per gram
  creditAmount        INTEGER NOT NULL,             -- paise
  remarks             TEXT,
  createdAt           TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oldgoldreceipts_invoice  FOREIGN KEY (invoiceId)        REFERENCES invoices  (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_oldgoldreceipts_customer FOREIGN KEY (customerId)       REFERENCES customers (id) ON UPDATE CASCADE,
  CONSTRAINT fk_oldgoldreceipts_purity   FOREIGN KEY (testedPurityCode) REFERENCES purities (code) ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uk_oldgoldreceipts_receiptGuid ON oldgoldreceipts (receiptGuid);
CREATE INDEX idx_oldgoldreceipts_invoiceId  ON oldgoldreceipts (invoiceId);
CREATE INDEX idx_oldgoldreceipts_customerId ON oldgoldreceipts (customerId);

CREATE TABLE auditlog (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actorUserId INTEGER,
  action      TEXT    NOT NULL,
  entity      TEXT    NOT NULL,
  entityId    TEXT,
  "before"    TEXT             CHECK ("before" IS NULL OR json_valid("before")),
  "after"     TEXT             CHECK ("after"  IS NULL OR json_valid("after")),
  createdAt   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auditlog_users FOREIGN KEY (actorUserId) REFERENCES users (uid) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX idx_auditlog_entity_entityId ON auditlog (entity, entityId);
CREATE INDEX idx_auditlog_createdAt       ON auditlog (createdAt);
CREATE INDEX idx_auditlog_actorUserId     ON auditlog (actorUserId);

-- ---------------------------------------------------------------------
-- updatedAt triggers (replace MySQL's ON UPDATE CURRENT_TIMESTAMP).
-- recursive_triggers is OFF by default, so the inner UPDATE does not
-- re-fire the trigger.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_users_updatedAt             AFTER UPDATE ON users             FOR EACH ROW BEGIN UPDATE users             SET updatedAt = CURRENT_TIMESTAMP WHERE uid = NEW.uid; END;
CREATE TRIGGER trg_mastercategories_updatedAt  AFTER UPDATE ON mastercategories  FOR EACH ROW BEGIN UPDATE mastercategories  SET updatedAt = CURRENT_TIMESTAMP WHERE id  = NEW.id;  END;
CREATE TRIGGER trg_subcategories_updatedAt     AFTER UPDATE ON subcategories     FOR EACH ROW BEGIN UPDATE subcategories     SET updatedAt = CURRENT_TIMESTAMP WHERE id  = NEW.id;  END;
CREATE TRIGGER trg_productcategories_updatedAt AFTER UPDATE ON productcategories FOR EACH ROW BEGIN UPDATE productcategories SET updatedAt = CURRENT_TIMESTAMP WHERE id  = NEW.id;  END;
CREATE TRIGGER trg_customers_updatedAt         AFTER UPDATE ON customers         FOR EACH ROW BEGIN UPDATE customers         SET updatedAt = CURRENT_TIMESTAMP WHERE id  = NEW.id;  END;
CREATE TRIGGER trg_taxslabs_updatedAt          AFTER UPDATE ON taxslabs          FOR EACH ROW BEGIN UPDATE taxslabs          SET updatedAt = CURRENT_TIMESTAMP WHERE id  = NEW.id;  END;
CREATE TRIGGER trg_shopsettings_updatedAt      AFTER UPDATE ON shopsettings      FOR EACH ROW BEGIN UPDATE shopsettings      SET updatedAt = CURRENT_TIMESTAMP WHERE id  = NEW.id;  END;
CREATE TRIGGER trg_products_updatedAt          AFTER UPDATE ON products          FOR EACH ROW BEGIN UPDATE products          SET updatedAt = CURRENT_TIMESTAMP WHERE id  = NEW.id;  END;
CREATE TRIGGER trg_invoices_updatedAt          AFTER UPDATE ON invoices          FOR EACH ROW BEGIN UPDATE invoices          SET updatedAt = CURRENT_TIMESTAMP WHERE id  = NEW.id;  END;
CREATE TRIGGER trg_invoicelineitems_updatedAt  AFTER UPDATE ON invoicelineitems  FOR EACH ROW BEGIN UPDATE invoicelineitems  SET updatedAt = CURRENT_TIMESTAMP WHERE id  = NEW.id;  END;
CREATE TRIGGER trg_payments_updatedAt          AFTER UPDATE ON payments          FOR EACH ROW BEGIN UPDATE payments          SET updatedAt = CURRENT_TIMESTAMP WHERE id  = NEW.id;  END;
CREATE TRIGGER trg_oldgoldreceipts_updatedAt   AFTER UPDATE ON oldgoldreceipts   FOR EACH ROW BEGIN UPDATE oldgoldreceipts   SET updatedAt = CURRENT_TIMESTAMP WHERE id  = NEW.id;  END;

-- ---------------------------------------------------------------------
-- Reference data (production-safe; NOT the 577 KB demo fixture).
-- Purities + tax slabs are canonical domain data the app needs to run.
-- ---------------------------------------------------------------------
INSERT INTO purities (code, label, metalType, fineness, sortOrder) VALUES
  ('999',  '24K Gold (999)',   'gold',     999, 10),
  ('995',  '23K Gold (995)',   'gold',     995, 15),
  ('916',  '22K Gold (916)',   'gold',     916, 20),
  ('875',  '21K Gold (875)',   'gold',     875, 30),
  ('750',  '18K Gold (750)',   'gold',     750, 40),
  ('585',  '14K Gold (585)',   'gold',     585, 50),
  ('S999', 'Fine Silver (999)','silver',   999, 60),
  ('P950', 'Platinum (950)',   'platinum', 950, 70);

INSERT INTO taxslabs (hsnCode, name, cgstRate, sgstRate, igstRate, active, effectiveFrom) VALUES
  ('7113', 'Articles of jewellery of precious metal', 1.50, 1.50, 3.00, 1, '2024-01-01'),
  ('7114', 'Articles of goldsmiths / silversmiths',   1.50, 1.50, 3.00, 1, '2024-01-01'),
  ('7118', 'Coin and bullion',                        1.50, 1.50, 3.00, 1, '2024-01-01');
