DROP procedure IF EXISTS `get_saving_scheme_details`;
DELIMITER $$
CREATE PROCEDURE `get_saving_scheme_details`(
  IN p_schemeGuid CHAR(36)
)
BEGIN
  SET time_zone = 'SYSTEM';

  SELECT
    s.id,
    s.schemeGuid,
    s.customerId,
    c.customerGuid,
    CONCAT(c.firstName, ' ', c.lastName) AS customerName,
    c.phoneNumber,
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
    (s.monthlyAmount * s.tenureMonths) AS expectedTotalContribution,
    (s.monthlyAmount * s.bonusInstallments) AS bonusAmount,
    (s.totalPaid + (s.monthlyAmount * s.bonusInstallments)) AS projectedCorpus,
    (SELECT COUNT(*) FROM savingschemeinstallments WHERE schemeId = s.id) AS installmentsPaid,
    (s.tenureMonths - (SELECT COUNT(*) FROM savingschemeinstallments WHERE schemeId = s.id)) AS installmentsRemaining,
    (CASE WHEN (SELECT COUNT(*) FROM savingschemeinstallments WHERE schemeId = s.id) >= s.tenureMonths THEN 1 ELSE 0 END) AS isEligibleForRedemption,
    s.createdAt
  FROM savingschemes s
  JOIN customers c ON c.id = s.customerId
  WHERE s.schemeGuid = p_schemeGuid;

  SELECT
    i.id,
    i.installmentGuid,
    i.installmentNumber,
    i.amount,
    i.paymentMode,
    i.refNumber,
    i.receiptDate,
    i.actorUserId,
    u.userName AS actorUserName,
    i.createdAt
  FROM savingschemeinstallments i
  LEFT JOIN users u ON u.uid = i.actorUserId
  WHERE i.schemeId = (SELECT id FROM savingschemes WHERE schemeGuid = p_schemeGuid)
  ORDER BY i.installmentNumber ASC;
END$$
DELIMITER ;
