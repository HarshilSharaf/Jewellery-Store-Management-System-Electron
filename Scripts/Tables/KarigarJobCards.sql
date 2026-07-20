-- P2 stub. DDL only. No SPs or UI in Phase 1.
CREATE TABLE `karigarjobcards` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `cardGuid` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `karigarName` VARCHAR(120) NOT NULL,
  `issueDate` DATE NOT NULL,
  `expectedReturnDate` DATE DEFAULT NULL,
  `actualReturnDate` DATE DEFAULT NULL,
  `metalIssuedGrams` DECIMAL(10, 3) NOT NULL DEFAULT 0.000,
  `metalReturnedGrams` DECIMAL(10, 3) NOT NULL DEFAULT 0.000,
  `wastageGrams` DECIMAL(10, 3) NOT NULL DEFAULT 0.000,
  `purityCode` VARCHAR(10) DEFAULT NULL,
  `status` ENUM('issued', 'in_progress', 'received', 'settled', 'cancelled') NOT NULL DEFAULT 'issued',
  `remarks` TEXT,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_karigarjobcards_cardGuid` (`cardGuid`),
  KEY `idx_karigarjobcards_status` (`status`),
  KEY `idx_karigarjobcards_karigarName` (`karigarName`),
  CONSTRAINT `fk_karigarjobcards_purity` FOREIGN KEY (`purityCode`) REFERENCES `purities` (`code`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
