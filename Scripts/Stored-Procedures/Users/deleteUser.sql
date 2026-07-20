DROP procedure IF EXISTS `delete_user`;
DELIMITER $$
CREATE PROCEDURE `delete_user`(
  IN p_userId      INT,
  IN p_actorUserId INT
)
BEGIN
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
    IF l_actor_type IS NOT NULL AND l_actor_type <> 'admin' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Forbidden: canManageUsers';
    END IF;
  END IF;

  IF p_userId = p_actorUserId THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'delete_user: cannot delete self';
  END IF;

  START TRANSACTION;
    DELETE FROM users WHERE uid = p_userId;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'delete_user', 'users', CAST(p_userId AS CHAR),
            JSON_OBJECT('deletedAt', NOW()));
  COMMIT;
END$$
DELIMITER ;
