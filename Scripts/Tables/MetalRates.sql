CREATE TABLE `metalrates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `effectiveDate` DATE NOT NULL,
  `session` ENUM('AM', 'PM') NOT NULL,
  `purityCode` VARCHAR(10) NOT NULL,
  `ratePerGram` DECIMAL(12, 2) NOT NULL,
  `source` ENUM('manual', 'ibja') NOT NULL DEFAULT 'manual',
  `setByUserId` INT DEFAULT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_metalrates_date_session_purity` (`effectiveDate`, `session`, `purityCode`),
  KEY `idx_metalrates_effectiveDate` (`effectiveDate`),
  CONSTRAINT `fk_metalrates_purities` FOREIGN KEY (`purityCode`) REFERENCES `purities` (`code`) ON UPDATE CASCADE,
  CONSTRAINT `fk_metalrates_users` FOREIGN KEY (`setByUserId`) REFERENCES `users` (`uid`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
