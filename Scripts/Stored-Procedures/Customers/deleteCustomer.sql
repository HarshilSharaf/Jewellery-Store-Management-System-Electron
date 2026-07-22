DROP procedure IF EXISTS `delete_customer`;
DELIMITER $$
CREATE PROCEDURE `delete_customer` (
  IN p_hardDelete   TINYINT(1),
  IN p_customerGuid CHAR(36),
  IN p_actorUserId  INT
)
BEGIN
  DECLARE l_actor_type VARCHAR(50) DEFAULT NULL;

  SET time_zone = 'SYSTEM';

  IF p_actorUserId IS NOT NULL THEN
    SELECT `type` INTO l_actor_type FROM users WHERE uid = p_actorUserId;
    IF l_actor_type IS NOT NULL AND l_actor_type = 'employee' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Forbidden: canDeleteCustomer';
    END IF;
  END IF;

  IF (p_hardDelete = 1) THEN
    DELETE FROM customers WHERE customerGuid = p_customerGuid;
  ELSE
    UPDATE customers
       SET deletedAt = CURRENT_TIMESTAMP()
     WHERE customerGuid = p_customerGuid;
  END IF;

  INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
  VALUES (p_actorUserId, 'delete_customer', 'customers', p_customerGuid,
          JSON_OBJECT('hardDelete', p_hardDelete));
END$$
DELIMITER ;
