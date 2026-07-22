CREATE TABLE `ibjaratesnapshots` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `snapshotGuid` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `fetchedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `session` ENUM('AM', 'PM') NOT NULL,
  `rawResponse` TEXT,
  `parsedRates` JSON DEFAULT NULL,
  `status` ENUM('success', 'parse_failure', 'network_error') NOT NULL,
  `errorMessage` VARCHAR(1000) DEFAULT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ibjaratesnapshots_snapshotGuid` (`snapshotGuid`),
  KEY `idx_ibjaratesnapshots_fetchedAt` (`fetchedAt`),
  KEY `idx_ibjaratesnapshots_session` (`session`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
