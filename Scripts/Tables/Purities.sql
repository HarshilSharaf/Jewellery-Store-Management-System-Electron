CREATE TABLE `purities` (
  `code` VARCHAR(10) NOT NULL,
  `label` VARCHAR(60) NOT NULL,
  `metalType` ENUM('gold', 'silver', 'platinum') NOT NULL,
  `fineness` SMALLINT NOT NULL,
  `sortOrder` SMALLINT NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`),
  KEY `idx_purities_metalType` (`metalType`, `sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
