CREATE TABLE `savingschemeinstallments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `installmentGuid` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `schemeId` INT NOT NULL,
  `installmentNumber` SMALLINT NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `paymentMode` ENUM('cash', 'cheque', 'online', 'upi', 'card') NOT NULL DEFAULT 'cash',
  `refNumber` VARCHAR(80) DEFAULT NULL,
  `receiptDate` DATE NOT NULL DEFAULT (CURRENT_DATE),
  `actorUserId` INT DEFAULT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_savingschemeinstallments_installmentGuid` (`installmentGuid`),
  UNIQUE KEY `uk_savingschemeinstallments_scheme_num` (`schemeId`, `installmentNumber`),
  KEY `idx_savingschemeinstallments_receiptDate` (`receiptDate`),
  CONSTRAINT `fk_savingschemeinstallments_scheme` FOREIGN KEY (`schemeId`)    REFERENCES `savingschemes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_savingschemeinstallments_user`   FOREIGN KEY (`actorUserId`) REFERENCES `users` (`uid`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
