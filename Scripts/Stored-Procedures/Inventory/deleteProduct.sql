DROP procedure IF EXISTS `delete_product`;
DELIMITER $$
CREATE PROCEDURE `delete_product` (
  IN p_hardDelete  TINYINT(1),
  IN p_productGuid CHAR(36),
  IN p_actorUserId INT
)
BEGIN
  DECLARE l_actor_type VARCHAR(50) DEFAULT NULL;

  SET time_zone = 'SYSTEM';

  IF p_actorUserId IS NOT NULL THEN
    SELECT `type` INTO l_actor_type FROM users WHERE uid = p_actorUserId;
    IF l_actor_type IS NOT NULL AND l_actor_type = 'employee' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Forbidden: canDeleteProduct';
    END IF;
  END IF;

  IF (p_hardDelete = 1) THEN
    DELETE FROM products WHERE productGuid = p_productGuid;
  ELSE
    UPDATE products
       SET deletedAt = CURRENT_TIMESTAMP()
     WHERE productGuid = p_productGuid;
  END IF;

  INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
  VALUES (p_actorUserId, 'delete_product', 'products', p_productGuid,
          JSON_OBJECT('hardDelete', p_hardDelete));
END$$
DELIMITER ;
