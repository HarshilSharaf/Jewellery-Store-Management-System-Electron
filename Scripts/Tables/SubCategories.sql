CREATE TABLE `subcategories` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subCategoryName` VARCHAR(255) NOT NULL,
  `subCategoryDescription` TEXT,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_subCategoryName` (`subCategoryName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci