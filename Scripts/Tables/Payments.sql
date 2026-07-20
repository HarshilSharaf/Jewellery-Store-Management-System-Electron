CREATE TABLE `payments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `paymentGuid` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `amount` DECIMAL(14, 2) NOT NULL,
  `paymentType` ENUM('cash', 'cheque', 'online', 'upi', 'card') NOT NULL,
  `refNumber` VARCHAR(80) DEFAULT NULL,
  `remarks` TEXT,
  `receivedOn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reconciledAt` DATETIME DEFAULT NULL,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `invoiceId` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payments_paymentGuid` (`paymentGuid`),
  KEY `idx_payments_receivedOn` (`receivedOn`),
  KEY `idx_payments_invoiceId` (`invoiceId`),
  CONSTRAINT `fk_payments_invoices` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
