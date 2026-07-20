CREATE TABLE `whatsappsendlog` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `sendGuid` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `invoiceId` INT DEFAULT NULL,
  `customerId` INT NOT NULL,
  `templateName` VARCHAR(128) NOT NULL,
  `templateLanguage` VARCHAR(16) NOT NULL DEFAULT 'en',
  `templateVariables` JSON DEFAULT NULL,
  `attachmentUrl` VARCHAR(1024) DEFAULT NULL,
  `phoneNumber` VARCHAR(24) NOT NULL,
  `metaMessageId` VARCHAR(128) DEFAULT NULL,
  `status` ENUM('queued', 'sent', 'delivered', 'read', 'failed') NOT NULL DEFAULT 'queued',
  `errorMessage` VARCHAR(1000) DEFAULT NULL,
  `sentByUserId` INT DEFAULT NULL,
  `queuedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sentAt` DATETIME DEFAULT NULL,
  `deliveredAt` DATETIME DEFAULT NULL,
  `readAt` DATETIME DEFAULT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_whatsappsendlog_sendGuid` (`sendGuid`),
  KEY `idx_whatsappsendlog_customerId` (`customerId`),
  KEY `idx_whatsappsendlog_invoiceId` (`invoiceId`),
  KEY `idx_whatsappsendlog_status` (`status`),
  KEY `idx_whatsappsendlog_queuedAt` (`queuedAt`),
  CONSTRAINT `fk_whatsappsendlog_customer`
    FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_whatsappsendlog_invoice`
    FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_whatsappsendlog_sentByUser`
    FOREIGN KEY (`sentByUserId`) REFERENCES `users` (`uid`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
