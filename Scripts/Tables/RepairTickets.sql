CREATE TABLE `repairtickets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ticketGuid` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ticketNumber` VARCHAR(32) NOT NULL,
  `customerId` INT NOT NULL,
  `receivedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `receivedByUserId` INT DEFAULT NULL,
  `itemDescription` VARCHAR(500) NOT NULL,
  `itemPhotoPath` VARCHAR(500) DEFAULT NULL,
  `weight` DECIMAL(10, 3) DEFAULT NULL,
  `estimatedCharge` DECIMAL(12, 2) DEFAULT NULL,
  `estimatedReturnDate` DATE DEFAULT NULL,
  `status` ENUM('received', 'in_progress', 'ready', 'delivered', 'declined') NOT NULL DEFAULT 'received',
  `actualCharge` DECIMAL(12, 2) DEFAULT NULL,
  `paymentMode` ENUM('cash', 'cheque', 'online') DEFAULT NULL,
  `paymentRef` VARCHAR(64) DEFAULT NULL,
  `deliveredAt` DATETIME DEFAULT NULL,
  `notes` VARCHAR(1000) DEFAULT NULL,
  `karigarId` INT DEFAULT NULL,
  `karigarJobId` INT DEFAULT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_repairtickets_ticketGuid` (`ticketGuid`),
  UNIQUE KEY `uk_repairtickets_ticketNumber` (`ticketNumber`),
  KEY `idx_repairtickets_customerId` (`customerId`),
  KEY `idx_repairtickets_status` (`status`),
  KEY `idx_repairtickets_receivedAt` (`receivedAt`),
  KEY `idx_repairtickets_deletedAt` (`deletedAt`),
  CONSTRAINT `fk_repairtickets_customer`
    FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_repairtickets_receivedByUser`
    FOREIGN KEY (`receivedByUserId`) REFERENCES `users` (`uid`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_repairtickets_karigar`
    FOREIGN KEY (`karigarId`) REFERENCES `karigars` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_repairtickets_karigarJob`
    FOREIGN KEY (`karigarJobId`) REFERENCES `karigarjobcards` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
