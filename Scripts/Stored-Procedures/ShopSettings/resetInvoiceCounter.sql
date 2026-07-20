DROP procedure IF EXISTS `reset_invoice_counter`;
DELIMITER $$
CREATE PROCEDURE `reset_invoice_counter`(
  IN p_newCounter  INT,
  IN p_actorUserId INT
)
BEGIN
  DECLARE l_actor_type VARCHAR(50) DEFAULT NULL;

  SET time_zone = 'SYSTEM';

  IF p_actorUserId IS NOT NULL THEN
    SELECT `type` INTO l_actor_type FROM users WHERE uid = p_actorUserId;
    IF l_actor_type IS NOT NULL AND l_actor_type = 'employee' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Forbidden: canEditShopSettings';
    END IF;
  END IF;

  UPDATE shopsettings
     SET currentInvoiceCounter = COALESCE(p_newCounter, 1),
         invoiceStartFrom      = COALESCE(p_newCounter, 1)
   WHERE id = 1;

  INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
  VALUES (p_actorUserId, 'reset_invoice_counter', 'shopsettings', '1',
          JSON_OBJECT('newCounter', p_newCounter));

  SELECT currentInvoiceCounter, invoiceStartFrom FROM shopsettings WHERE id = 1;
END$$
DELIMITER ;
