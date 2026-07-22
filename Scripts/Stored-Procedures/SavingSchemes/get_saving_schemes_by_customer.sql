DROP procedure IF EXISTS `get_saving_schemes_by_customer`;
DELIMITER $$
CREATE PROCEDURE `get_saving_schemes_by_customer`(
  IN p_customerGuid CHAR(36)
)
BEGIN
  DECLARE l_customerId INT DEFAULT NULL;

  SET time_zone = 'SYSTEM';
  SELECT id INTO l_customerId FROM customers WHERE customerGuid = p_customerGuid;

  SELECT
    s.id,
    s.schemeGuid,
    s.customerId,
    s.planName,
    s.monthlyAmount,
    s.tenureMonths,
    s.bonusInstallments,
    s.startDate,
    s.expectedMaturityDate,
    s.totalPaid,
    s.status,
    s.redeemedInvoiceId,
    (SELECT invoiceNumber FROM invoices WHERE id = s.redeemedInvoiceId) AS redeemedInvoiceNumber,
    s.redeemedAmount,
    s.redeemedAt,
    s.forfeitedAt,
    s.forfeitReason,
    (SELECT COUNT(*) FROM savingschemeinstallments WHERE schemeId = s.id) AS installmentsPaid,
    s.createdAt
  FROM savingschemes s
  WHERE s.customerId = l_customerId
    AND s.deletedAt IS NULL
  ORDER BY s.createdAt DESC;
END$$
DELIMITER ;
