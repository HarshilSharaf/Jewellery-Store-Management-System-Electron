-- P2 stub. DDL only. No SPs or UI in Phase 1.
CREATE TABLE `karigarledger` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `karigarName` VARCHAR(120) NOT NULL,
  `jobCardId` INT DEFAULT NULL,
  `txnDate` DATE NOT NULL,
  `direction` ENUM('debit', 'credit') NOT NULL,
  `grams` DECIMAL(10, 3) NOT NULL DEFAULT 0.000,
  `amount` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `description` VARCHAR(255) DEFAULT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_karigarledger_karigarName_txnDate` (`karigarName`, `txnDate`),
  KEY `idx_karigarledger_jobCardId` (`jobCardId`),
  CONSTRAINT `fk_karigarledger_jobcard` FOREIGN KEY (`jobCardId`) REFERENCES `karigarjobcards` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
