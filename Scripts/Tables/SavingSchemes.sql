-- P2 stub. DDL only. No SPs or UI in Phase 1.
CREATE TABLE `savingschemes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `schemeGuid` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `customerId` INT NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `monthlyAmount` DECIMAL(12, 2) NOT NULL,
  `durationMonths` SMALLINT NOT NULL,
  `startDate` DATE NOT NULL,
  `maturityDate` DATE NOT NULL,
  `bonusPercent` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  `status` ENUM('active', 'matured', 'redeemed', 'cancelled') NOT NULL DEFAULT 'active',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_savingschemes_schemeGuid` (`schemeGuid`),
  KEY `idx_savingschemes_customerId` (`customerId`),
  KEY `idx_savingschemes_status` (`status`),
  CONSTRAINT `fk_savingschemes_customer` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
