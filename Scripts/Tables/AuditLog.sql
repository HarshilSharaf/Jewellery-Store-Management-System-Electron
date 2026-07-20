CREATE TABLE `auditlog` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `actorUserId` INT DEFAULT NULL,
  `action` VARCHAR(80) NOT NULL,
  `entity` VARCHAR(80) NOT NULL,
  `entityId` VARCHAR(64) DEFAULT NULL,
  `before` JSON DEFAULT NULL,
  `after` JSON DEFAULT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_auditlog_entity_entityId` (`entity`, `entityId`),
  KEY `idx_auditlog_createdAt` (`createdAt`),
  KEY `idx_auditlog_actorUserId` (`actorUserId`),
  CONSTRAINT `fk_auditlog_users` FOREIGN KEY (`actorUserId`) REFERENCES `users` (`uid`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
