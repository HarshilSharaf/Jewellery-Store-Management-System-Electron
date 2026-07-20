DROP procedure IF EXISTS `get_gstr1_export_rows`;
DELIMITER $$
CREATE PROCEDURE `get_gstr1_export_rows`(
  IN p_monthYear VARCHAR(7)
)
BEGIN
  DECLARE l_year  INT;
  DECLARE l_month INT;
  DECLARE l_periodStart DATE;
  DECLARE l_periodEnd   DATE;

  SET time_zone = 'SYSTEM';

  IF p_monthYear IS NULL OR p_monthYear = '' THEN
    SET l_year  = YEAR(CURDATE());
    SET l_month = MONTH(CURDATE());
  ELSE
    SET l_year  = CAST(SUBSTRING(p_monthYear, 1, 4) AS UNSIGNED);
    SET l_month = CAST(SUBSTRING(p_monthYear, 6, 2) AS UNSIGNED);
  END IF;

  SET l_periodStart = DATE(CONCAT(l_year, '-', LPAD(l_month, 2, '0'), '-01'));
  SET l_periodEnd   = LAST_DAY(l_periodStart);

  SELECT
    i.invoiceNumber,
    DATE(i.createdAt) AS invoiceDate,
    c.gstin           AS customerGstin,
    CASE
      WHEN c.gstin IS NOT NULL AND c.gstin <> '' THEN 'B2B'
      ELSE 'B2CS'
    END AS invoiceType,
    CONCAT(c.stateCode, '-', c.state) AS placeOfSupply,
    i.placeOfSupply   AS invoicePlaceOfSupply,
    i.hsn             AS hsnCode,
    i.subTotalTaxable AS taxableValue,
    CASE WHEN i.totalIgst > 0 THEN 0 ELSE ROUND(
      CASE WHEN i.subTotalTaxable = 0 THEN 0
           ELSE (i.totalCgst / i.subTotalTaxable) * 100 END, 2) END AS cgstRate,
    CASE WHEN i.totalIgst > 0 THEN 0 ELSE ROUND(
      CASE WHEN i.subTotalTaxable = 0 THEN 0
           ELSE (i.totalSgst / i.subTotalTaxable) * 100 END, 2) END AS sgstRate,
    ROUND(CASE WHEN i.subTotalTaxable = 0 THEN 0
               ELSE (i.totalIgst / i.subTotalTaxable) * 100 END, 2) AS igstRate,
    i.totalCgst  AS cgstAmount,
    i.totalSgst  AS sgstAmount,
    i.totalIgst  AS igstAmount,
    i.grandTotal AS invoiceValue
  FROM invoices i
  JOIN customers c ON c.id = i.soldToCustomer
  WHERE DATE(i.createdAt) BETWEEN l_periodStart AND l_periodEnd
    AND i.cancelledAt IS NULL
  ORDER BY i.createdAt ASC;

  SELECT
    i.hsn AS hsnCode,
    COUNT(*) AS invoiceCount,
    COALESCE(SUM(i.subTotalTaxable), 0) AS taxableValue,
    COALESCE(SUM(i.totalCgst), 0)  AS cgstAmount,
    COALESCE(SUM(i.totalSgst), 0)  AS sgstAmount,
    COALESCE(SUM(i.totalIgst), 0)  AS igstAmount,
    COALESCE(SUM(i.grandTotal), 0) AS invoiceValue
  FROM invoices i
  WHERE DATE(i.createdAt) BETWEEN l_periodStart AND l_periodEnd
    AND i.cancelledAt IS NULL
  GROUP BY i.hsn
  ORDER BY i.hsn ASC;
END$$
DELIMITER ;
