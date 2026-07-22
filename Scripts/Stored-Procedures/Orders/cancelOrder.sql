DROP procedure IF EXISTS `cancel_order`;
DELIMITER $$
CREATE PROCEDURE `cancel_order` (
  IN p_orderGuid    CHAR(36),
  IN p_cancelReason VARCHAR(255),
  IN p_actorUserId  INT
)
BEGIN
  DECLARE l_invoiceId INT DEFAULT NULL;
  DECLARE l_actor_type VARCHAR(50) DEFAULT NULL;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  IF p_actorUserId IS NOT NULL THEN
    SELECT `type` INTO l_actor_type FROM users WHERE uid = p_actorUserId;
    IF l_actor_type IS NOT NULL AND l_actor_type = 'employee' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Forbidden: canCancelInvoice';
    END IF;
  END IF;

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
      VALUES (p_actorUserId, 'cancel_order', 'invoices', CAST(l_invoiceId AS CHAR),
              JSON_OBJECT('cancelReason', p_cancelReason));
    COMMIT;
  END IF;
END$$
DELIMITER ;
