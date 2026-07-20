-- P2 stub. DDL only. No SPs or UI in Phase 1.
CREATE TABLE `savingschemeinstallments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `schemeId` INT NOT NULL,
  `installmentNumber` SMALLINT NOT NULL,
  `dueDate` DATE NOT NULL,
  `paidOn` DATETIME DEFAULT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `paymentId` INT DEFAULT NULL,
  `status` ENUM('due', 'paid', 'skipped') NOT NULL DEFAULT 'due',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_savingschemeinstallments_scheme_num` (`schemeId`, `installmentNumber`),
  KEY `idx_savingschemeinstallments_status` (`status`),
  CONSTRAINT `fk_savingschemeinstallments_scheme`  FOREIGN KEY (`schemeId`) REFERENCES `savingschemes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_savingschemeinstallments_payment` FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
