-- =====================================================================
-- SQLite migration version 2 — P2 tables
--
-- Ported from Scripts/Tables/*.sql (MySQL). Same conventions as
-- 001_baseline.sql: money -> INTEGER paise, weight -> INTEGER milligrams,
-- ENUM -> TEXT+CHECK, TINYINT(1) -> INTEGER+CHECK, JSON -> TEXT+json_valid,
-- DATETIME/DATE -> TEXT, AUTO_INCREMENT PK -> INTEGER PRIMARY KEY AUTOINCREMENT
-- (incl. the BIGINT ledger/stockmovements ids), updatedAt via AFTER UPDATE
-- triggers. Parent-first ordering; parents from v1 (customers, invoices,
-- users, purities, products) already exist.
-- =====================================================================

CREATE TABLE karigars (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  karigarGuid TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  phone       TEXT,
  address     TEXT,
  remarks     TEXT,
  createdAt   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deletedAt   TEXT
);
CREATE UNIQUE INDEX uk_karigars_karigarGuid ON karigars (karigarGuid);
CREATE UNIQUE INDEX uk_karigars_name_phone  ON karigars (name, phone);
CREATE INDEX idx_karigars_deletedAt_name    ON karigars (deletedAt, name);

CREATE TABLE karigarjobcards (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  jobGuid               TEXT    NOT NULL,
  karigarId             INTEGER NOT NULL,
  issueDate             TEXT    NOT NULL,
  expectedReturnDate    TEXT,
  receivedDate          TEXT,
  issuedGrossWeight     INTEGER NOT NULL DEFAULT 0,   -- mg
  issuedPurityCode      TEXT,
  issuedStones          TEXT             CHECK (issuedStones IS NULL OR json_valid(issuedStones)),
  receivedGrossWeight   INTEGER NOT NULL DEFAULT 0,   -- mg
  receivedNetWeight     INTEGER NOT NULL DEFAULT 0,   -- mg
  receivedStoneWeight   INTEGER NOT NULL DEFAULT 0,   -- mg
  wastagePercentAllowed REAL    NOT NULL DEFAULT 0,
  wastageGramsActual    INTEGER NOT NULL DEFAULT 0,   -- mg
  makingCharge          INTEGER NOT NULL DEFAULT 0,   -- paise
  settlementAmount      INTEGER NOT NULL DEFAULT 0,   -- paise
  settlementPaymentMode TEXT,
  settlementRefNumber   TEXT,
  settledAt             TEXT,
  productId             INTEGER,
  description           TEXT,
  remarks               TEXT,
  status                TEXT    NOT NULL DEFAULT 'issued'
                          CHECK (status IN ('issued','received','settled','cancelled')),
  createdAt             TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt             TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deletedAt             TEXT,
  CONSTRAINT fk_karigarjobcards_karigar FOREIGN KEY (karigarId)        REFERENCES karigars (id) ON UPDATE CASCADE,
  CONSTRAINT fk_karigarjobcards_purity  FOREIGN KEY (issuedPurityCode) REFERENCES purities (code) ON UPDATE CASCADE,
  CONSTRAINT fk_karigarjobcards_product FOREIGN KEY (productId)        REFERENCES products (id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uk_karigarjobcards_jobGuid ON karigarjobcards (jobGuid);
CREATE INDEX idx_karigarjobcards_karigarId ON karigarjobcards (karigarId);
CREATE INDEX idx_karigarjobcards_status    ON karigarjobcards (status);
CREATE INDEX idx_karigarjobcards_issueDate ON karigarjobcards (issueDate);

CREATE TABLE karigarledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,   -- was BIGINT
  ledgerGuid  TEXT    NOT NULL,
  karigarId   INTEGER NOT NULL,
  jobId       INTEGER,
  entryType   TEXT    NOT NULL CHECK (entryType IN ('issue','receive','payment','adjustment')),
  direction   TEXT    NOT NULL CHECK (direction IN ('debit','credit')),
  weightGrams INTEGER,   -- mg
  amount      INTEGER,   -- paise
  txnDate     TEXT    NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  actorUserId INTEGER,
  createdAt   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_karigarledger_karigar FOREIGN KEY (karigarId)   REFERENCES karigars (id) ON UPDATE CASCADE,
  CONSTRAINT fk_karigarledger_job     FOREIGN KEY (jobId)       REFERENCES karigarjobcards (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_karigarledger_user    FOREIGN KEY (actorUserId) REFERENCES users (uid) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uk_karigarledger_ledgerGuid ON karigarledger (ledgerGuid);
CREATE INDEX idx_karigarledger_karigarId_txnDate ON karigarledger (karigarId, txnDate);
CREATE INDEX idx_karigarledger_jobId ON karigarledger (jobId);

CREATE TABLE savingschemes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  schemeGuid           TEXT    NOT NULL,
  customerId           INTEGER NOT NULL,
  planName             TEXT    NOT NULL,
  monthlyAmount        INTEGER NOT NULL,             -- paise
  tenureMonths         INTEGER NOT NULL DEFAULT 11,
  bonusInstallments    INTEGER NOT NULL DEFAULT 1,
  startDate            TEXT    NOT NULL,
  expectedMaturityDate TEXT    NOT NULL,
  totalPaid            INTEGER NOT NULL DEFAULT 0,   -- paise
  status               TEXT    NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','matured','redeemed','forfeited')),
  redeemedInvoiceId    INTEGER,
  redeemedAmount       INTEGER,                      -- paise
  redeemedAt           TEXT,
  forfeitedAt          TEXT,
  forfeitReason        TEXT,
  createdAt            TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt            TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deletedAt            TEXT,
  CONSTRAINT fk_savingschemes_customer FOREIGN KEY (customerId)        REFERENCES customers (id) ON UPDATE CASCADE,
  CONSTRAINT fk_savingschemes_invoice  FOREIGN KEY (redeemedInvoiceId) REFERENCES invoices (id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uk_savingschemes_schemeGuid ON savingschemes (schemeGuid);
CREATE INDEX idx_savingschemes_customerId ON savingschemes (customerId);
CREATE INDEX idx_savingschemes_status     ON savingschemes (status);
CREATE INDEX idx_savingschemes_startDate  ON savingschemes (startDate);

CREATE TABLE savingschemeinstallments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  installmentGuid   TEXT    NOT NULL,
  schemeId          INTEGER NOT NULL,
  installmentNumber INTEGER NOT NULL,
  amount            INTEGER NOT NULL,               -- paise
  paymentMode       TEXT    NOT NULL DEFAULT 'cash'
                      CHECK (paymentMode IN ('cash','cheque','online','upi','card')),
  refNumber         TEXT,
  receiptDate       TEXT    NOT NULL DEFAULT CURRENT_DATE,
  actorUserId       INTEGER,
  createdAt         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ssi_scheme FOREIGN KEY (schemeId)    REFERENCES savingschemes (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ssi_user   FOREIGN KEY (actorUserId) REFERENCES users (uid) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uk_ssi_installmentGuid ON savingschemeinstallments (installmentGuid);
CREATE UNIQUE INDEX uk_ssi_scheme_num      ON savingschemeinstallments (schemeId, installmentNumber);
CREATE INDEX idx_ssi_receiptDate           ON savingschemeinstallments (receiptDate);

CREATE TABLE repairtickets (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ticketGuid          TEXT    NOT NULL,
  ticketNumber        TEXT    NOT NULL,
  customerId          INTEGER NOT NULL,
  receivedAt          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  receivedByUserId    INTEGER,
  itemDescription     TEXT    NOT NULL,
  itemPhotoPath       TEXT,
  weight              INTEGER,                       -- mg
  estimatedCharge     INTEGER,                       -- paise
  estimatedReturnDate TEXT,
  status              TEXT    NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received','in_progress','ready','delivered','declined')),
  actualCharge        INTEGER,                       -- paise
  paymentMode         TEXT             CHECK (paymentMode IS NULL OR paymentMode IN ('cash','cheque','online')),
  paymentRef          TEXT,
  deliveredAt         TEXT,
  notes               TEXT,
  karigarId           INTEGER,
  karigarJobId        INTEGER,
  createdAt           TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deletedAt           TEXT,
  CONSTRAINT fk_repairtickets_customer       FOREIGN KEY (customerId)       REFERENCES customers (id) ON UPDATE CASCADE,
  CONSTRAINT fk_repairtickets_receivedByUser FOREIGN KEY (receivedByUserId) REFERENCES users (uid) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_repairtickets_karigar        FOREIGN KEY (karigarId)        REFERENCES karigars (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_repairtickets_karigarJob     FOREIGN KEY (karigarJobId)     REFERENCES karigarjobcards (id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uk_repairtickets_ticketGuid   ON repairtickets (ticketGuid);
CREATE UNIQUE INDEX uk_repairtickets_ticketNumber ON repairtickets (ticketNumber);
CREATE INDEX idx_repairtickets_customerId ON repairtickets (customerId);
CREATE INDEX idx_repairtickets_status     ON repairtickets (status);
CREATE INDEX idx_repairtickets_receivedAt ON repairtickets (receivedAt);
CREATE INDEX idx_repairtickets_deletedAt  ON repairtickets (deletedAt);

CREATE TABLE whatsappsendlog (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sendGuid          TEXT    NOT NULL,
  invoiceId         INTEGER,
  customerId        INTEGER NOT NULL,
  templateName      TEXT    NOT NULL,
  templateLanguage  TEXT    NOT NULL DEFAULT 'en',
  templateVariables TEXT             CHECK (templateVariables IS NULL OR json_valid(templateVariables)),
  attachmentUrl     TEXT,
  phoneNumber       TEXT    NOT NULL,
  metaMessageId     TEXT,
  status            TEXT    NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','sent','delivered','read','failed')),
  errorMessage      TEXT,
  sentByUserId      INTEGER,
  queuedAt          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sentAt            TEXT,
  deliveredAt       TEXT,
  readAt            TEXT,
  createdAt         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_whatsappsendlog_customer   FOREIGN KEY (customerId)   REFERENCES customers (id) ON UPDATE CASCADE,
  CONSTRAINT fk_whatsappsendlog_invoice    FOREIGN KEY (invoiceId)    REFERENCES invoices (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_whatsappsendlog_sentByUser FOREIGN KEY (sentByUserId) REFERENCES users (uid) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uk_whatsappsendlog_sendGuid ON whatsappsendlog (sendGuid);
CREATE INDEX idx_whatsappsendlog_customerId ON whatsappsendlog (customerId);
CREATE INDEX idx_whatsappsendlog_invoiceId  ON whatsappsendlog (invoiceId);
CREATE INDEX idx_whatsappsendlog_status     ON whatsappsendlog (status);
CREATE INDEX idx_whatsappsendlog_queuedAt   ON whatsappsendlog (queuedAt);

CREATE TABLE ibjaratesnapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshotGuid TEXT    NOT NULL,
  fetchedAt    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  session      TEXT    NOT NULL CHECK (session IN ('AM','PM')),
  rawResponse  TEXT,
  parsedRates  TEXT             CHECK (parsedRates IS NULL OR json_valid(parsedRates)),
  status       TEXT    NOT NULL CHECK (status IN ('success','parse_failure','network_error')),
  errorMessage TEXT,
  createdAt    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uk_ibjaratesnapshots_snapshotGuid ON ibjaratesnapshots (snapshotGuid);
CREATE INDEX idx_ibjaratesnapshots_fetchedAt ON ibjaratesnapshots (fetchedAt);
CREATE INDEX idx_ibjaratesnapshots_session   ON ibjaratesnapshots (session);

CREATE TABLE stockmovements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,   -- was BIGINT
  productId       INTEGER,
  movementType    TEXT    NOT NULL
                    CHECK (movementType IN ('purchase','sale','return','adjustment','karigar_issue','karigar_receive')),
  quantity        INTEGER NOT NULL DEFAULT 1,
  netWeightDelta  INTEGER NOT NULL DEFAULT 0,   -- mg
  referenceType   TEXT,
  referenceId     INTEGER,
  remarks         TEXT,
  createdAt       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdByUserId INTEGER,
  CONSTRAINT fk_stockmovements_product FOREIGN KEY (productId)       REFERENCES products (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_stockmovements_user    FOREIGN KEY (createdByUserId) REFERENCES users (uid) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX idx_stockmovements_productId_createdAt ON stockmovements (productId, createdAt);
CREATE INDEX idx_stockmovements_reference          ON stockmovements (referenceType, referenceId);

-- updatedAt triggers (tables that have an updatedAt column)
CREATE TRIGGER trg_karigars_updatedAt        AFTER UPDATE ON karigars        FOR EACH ROW BEGIN UPDATE karigars        SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
CREATE TRIGGER trg_karigarjobcards_updatedAt AFTER UPDATE ON karigarjobcards FOR EACH ROW BEGIN UPDATE karigarjobcards SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
CREATE TRIGGER trg_savingschemes_updatedAt   AFTER UPDATE ON savingschemes   FOR EACH ROW BEGIN UPDATE savingschemes   SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
CREATE TRIGGER trg_repairtickets_updatedAt   AFTER UPDATE ON repairtickets   FOR EACH ROW BEGIN UPDATE repairtickets   SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
