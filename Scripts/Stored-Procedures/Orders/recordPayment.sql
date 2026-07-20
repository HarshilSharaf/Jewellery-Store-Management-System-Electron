DROP procedure IF EXISTS `record_payment`;
DELIMITER $$
CREATE PROCEDURE `record_payment`(
  IN p_orderGuid     CHAR(36),
  IN p_paymentType   VARCHAR(20),
  IN p_refNumber     VARCHAR(80),
  IN p_remarks       TEXT,
  IN p_paymentAmount DECIMAL(14, 2),
  IN p_receivedOn    DATETIME
)
BEGIN
  DECLARE l_invoiceId INT DEFAULT NULL;
  DECLARE l_grandTotal DECIMAL(14, 2) DEFAULT 0;
  DECLARE l_paymentGuid CHAR(36) DEFAULT NULL;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    SELECT CONCAT('Error: ', error_code, ', ', error_msg) AS message;
  END;

  SET time_zone = 'SYSTEM';
  SELECT id, grandTotal INTO l_invoiceId, l_grandTotal
    FROM invoices WHERE invoiceGuid = p_orderGuid;
  SET l_paymentGuid = UUID();

  IF l_invoiceId IS NOT NULL THEN
    START TRANSACTION;
      INSERT INTO payments
        (paymentGuid, amount, paymentType, refNumber, remarks, receivedOn, invoiceId)
      VALUES
        (l_paymentGuid, p_paymentAmount, p_paymentType, p_refNumber,
         p_remarks, COALESCE(p_receivedOn, NOW()), l_invoiceId);

      IF ((SELECT SUM(amount) FROM payments WHERE invoiceId = l_invoiceId) >= l_grandTotal) THEN
        UPDATE invoices SET isPaymentDone = 1 WHERE id = l_invoiceId;
      END IF;
    COMMIT;
  END IF;
END$$
DELIMITER ;
