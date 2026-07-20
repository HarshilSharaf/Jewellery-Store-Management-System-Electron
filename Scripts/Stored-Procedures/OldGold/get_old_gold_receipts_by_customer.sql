DROP procedure IF EXISTS `get_old_gold_receipts_by_customer`;
DELIMITER $$
CREATE PROCEDURE `get_old_gold_receipts_by_customer`(
  IN p_customerGuid CHAR(36)
)
BEGIN
  DECLARE l_customerId INT DEFAULT NULL;

  SET time_zone = 'SYSTEM';
  SELECT id INTO l_customerId FROM customers WHERE customerGuid = p_customerGuid;

  SELECT
    r.id,
    r.receiptGuid,
    r.invoiceId,
    i.invoiceGuid,
    i.invoiceNumber,
    r.customerId,
    c.customerGuid,
    CONCAT(c.firstName, ' ', c.lastName) AS customerName,
    r.grossWeight,
    r.testedPurityCode,
    r.testedPurityPercent,
    r.deductionPercent,
    r.ratePerGram,
    r.creditAmount,
    r.remarks,
    r.createdAt,
    r.updatedAt
  FROM oldgoldreceipts r
  JOIN customers c ON c.id = r.customerId
  LEFT JOIN invoices i ON i.id = r.invoiceId
  WHERE r.customerId = l_customerId
  ORDER BY r.createdAt DESC;
END$$
DELIMITER ;
