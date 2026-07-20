DROP procedure IF EXISTS `get_day_book`;
DELIMITER $$
CREATE PROCEDURE `get_day_book`(
  IN p_dateFrom DATE,
  IN p_dateTo   DATE
)
BEGIN
  DECLARE l_from DATE;
  DECLARE l_to   DATE;

  SET time_zone = 'SYSTEM';
  SET l_from = COALESCE(p_dateFrom, DATE_SUB(CURDATE(), INTERVAL 30 DAY));
  SET l_to   = COALESCE(p_dateTo,   CURDATE());

  SELECT
    pays.txDate,
    pays.cash,
    pays.cheque,
    pays.upi,
    pays.card,
    pays.online,
    pays.total,
    pays.invoiceCount,
    COALESCE(inv.totalTaxableValue, 0) AS totalTaxableValue
  FROM (
    SELECT
      DATE(p.receivedOn) AS txDate,
      COALESCE(SUM(CASE WHEN p.paymentType = 'cash'   THEN p.amount END), 0) AS cash,
      COALESCE(SUM(CASE WHEN p.paymentType = 'cheque' THEN p.amount END), 0) AS cheque,
      COALESCE(SUM(CASE WHEN p.paymentType = 'upi'    THEN p.amount END), 0) AS upi,
      COALESCE(SUM(CASE WHEN p.paymentType = 'card'   THEN p.amount END), 0) AS card,
      COALESCE(SUM(CASE WHEN p.paymentType = 'online' THEN p.amount END), 0) AS online,
      COALESCE(SUM(p.amount), 0) AS total,
      COUNT(DISTINCT p.invoiceId) AS invoiceCount
    FROM payments p
    WHERE DATE(p.receivedOn) BETWEEN l_from AND l_to
    GROUP BY DATE(p.receivedOn)
  ) pays
  LEFT JOIN (
    SELECT DATE(i.createdAt) AS invDate,
           COALESCE(SUM(i.subTotalTaxable), 0) AS totalTaxableValue
    FROM invoices i
    WHERE DATE(i.createdAt) BETWEEN l_from AND l_to
      AND i.cancelledAt IS NULL
    GROUP BY DATE(i.createdAt)
  ) inv ON inv.invDate = pays.txDate
  ORDER BY pays.txDate ASC;
END$$
DELIMITER ;
