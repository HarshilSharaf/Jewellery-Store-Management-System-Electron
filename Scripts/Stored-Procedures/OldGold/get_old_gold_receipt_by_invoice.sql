DROP procedure IF EXISTS `get_old_gold_receipt_by_invoice`;
DELIMITER $$
CREATE PROCEDURE `get_old_gold_receipt_by_invoice`(
  IN p_invoiceGuid CHAR(36)
)
BEGIN
  DECLARE l_invoiceId INT DEFAULT NULL;

  SET time_zone = 'SYSTEM';
  SELECT id INTO l_invoiceId FROM invoices WHERE invoiceGuid = p_invoiceGuid;

  SELECT
    r.id,
    r.receiptGuid,
    r.invoiceId,
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
  WHERE r.invoiceId = l_invoiceId
  ORDER BY r.createdAt ASC;
END$$
DELIMITER ;
