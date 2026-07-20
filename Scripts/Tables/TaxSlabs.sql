CREATE TABLE `taxslabs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `hsnCode` VARCHAR(8) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `cgstRate` DECIMAL(5, 2) NOT NULL,
  `sgstRate` DECIMAL(5, 2) NOT NULL,
  `igstRate` DECIMAL(5, 2) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `effectiveFrom` DATE NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_taxslabs_hsnCode_effectiveFrom` (`hsnCode`, `effectiveFrom`),
  KEY `idx_taxslabs_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
