DROP procedure IF EXISTS `get_sales_register`;
DELIMITER $$
CREATE PROCEDURE `get_sales_register`(
  IN p_dateFrom      DATE,
  IN p_dateTo        DATE,
  IN p_customerGuid  CHAR(36),
  IN p_statusFilter  VARCHAR(20)
)
BEGIN
  DECLARE l_from DATE;
  DECLARE l_to   DATE;
  DECLARE l_customerId INT DEFAULT NULL;

  SET time_zone = 'SYSTEM';
  SET l_from = COALESCE(p_dateFrom, DATE_SUB(CURDATE(), INTERVAL 30 DAY));
  SET l_to   = COALESCE(p_dateTo,   CURDATE());
  IF p_customerGuid IS NOT NULL AND p_customerGuid <> '' THEN
    SELECT id INTO l_customerId FROM customers WHERE customerGuid = p_customerGuid;
  END IF;

  SELECT
    i.id,
    i.invoiceGuid,
    i.invoiceNumber,
    DATE(i.createdAt) AS invoiceDate,
    CONCAT(c.firstName, ' ', c.lastName) AS customerName,
    c.gstin        AS customerGstin,
    c.pan          AS customerPan,
    c.state        AS customerState,
    c.stateCode    AS customerStateCode,
    i.placeOfSupply,
    i.hsn,
    i.subTotalTaxable,
    i.totalCgst    AS cgstAmount,
    i.totalSgst    AS sgstAmount,
    i.totalIgst    AS igstAmount,
    i.totalMakingCharge,
    i.totalStoneCharge,
    i.totalWastageCharge,
    i.totalDiscount,
    i.oldGoldCreditAmount AS oldGoldCredit,
    i.roundOffAmount,
    i.grandTotal,
    CASE
      WHEN i.cancelledAt IS NOT NULL THEN 'cancelled'
      WHEN i.isPaymentDone = 1        THEN 'paid'
      ELSE 'pending'
    END AS status,
    CASE WHEN c.gstin IS NOT NULL AND c.gstin <> '' THEN 'B2B' ELSE 'B2CS' END AS invoiceType
  FROM invoices i
  JOIN customers c ON c.id = i.soldToCustomer
  WHERE DATE(i.createdAt) BETWEEN l_from AND l_to
    AND (l_customerId IS NULL OR i.soldToCustomer = l_customerId)
    AND (p_statusFilter IS NULL OR p_statusFilter = ''
         OR (p_statusFilter = 'paid'      AND i.cancelledAt IS NULL AND i.isPaymentDone = 1)
         OR (p_statusFilter = 'pending'   AND i.cancelledAt IS NULL AND i.isPaymentDone = 0)
         OR (p_statusFilter = 'cancelled' AND i.cancelledAt IS NOT NULL))
  ORDER BY i.createdAt ASC;
END$$
DELIMITER ;
