-- P2 stub. DDL only. No SPs or UI in Phase 1.
CREATE TABLE `stockmovements` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `productId` INT DEFAULT NULL,
  `movementType` ENUM('purchase', 'sale', 'return', 'adjustment', 'karigar_issue', 'karigar_receive') NOT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `netWeightDelta` DECIMAL(10, 3) NOT NULL DEFAULT 0.000,
  `referenceType` VARCHAR(40) DEFAULT NULL,
  `referenceId` INT DEFAULT NULL,
  `remarks` VARCHAR(255) DEFAULT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdByUserId` INT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_stockmovements_productId_createdAt` (`productId`, `createdAt`),
  KEY `idx_stockmovements_reference` (`referenceType`, `referenceId`),
  CONSTRAINT `fk_stockmovements_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_stockmovements_user`    FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`uid`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
