DROP procedure IF EXISTS `cancel_order`;
DELIMITER $$
CREATE PROCEDURE `cancel_order` (
  IN p_orderGuid    CHAR(36),
  IN p_cancelReason VARCHAR(255)
)
BEGIN
  DECLARE l_invoiceId INT DEFAULT NULL;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    SELECT CONCAT('Error: ', error_code, ', ', error_msg) AS message;
  END;

  SET time_zone = 'SYSTEM';
  SET l_invoiceId = (SELECT id FROM invoices WHERE invoiceGuid = p_orderGuid);

  IF l_invoiceId IS NOT NULL THEN
    START TRANSACTION;
      UPDATE products
         SET isSold = 0
       WHERE id IN (SELECT productId FROM invoicelineitems
                     WHERE invoiceId = l_invoiceId AND productId IS NOT NULL);

      DELETE FROM invoicelineitems WHERE invoiceId = l_invoiceId;

      UPDATE invoices
         SET cancelledAt  = CURRENT_TIMESTAMP(),
             cancelReason = p_cancelReason
       WHERE id = l_invoiceId;

      INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
      VALUES (NULL, 'cancel_order', 'invoices', CAST(l_invoiceId AS CHAR),
              JSON_OBJECT('cancelReason', p_cancelReason));
    COMMIT;
  END IF;
END$$
DELIMITER ;
