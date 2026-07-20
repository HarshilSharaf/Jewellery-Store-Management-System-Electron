DROP procedure IF EXISTS `add_user`;
DELIMITER $$
CREATE PROCEDURE `add_user`(
  IN p_userName    VARCHAR(50),
  IN p_email       VARCHAR(100),
  IN p_password    VARCHAR(255),
  IN p_type        VARCHAR(50),
  IN p_permissions JSON,
  IN p_actorUserId INT
)
BEGIN
  DECLARE l_actor_type VARCHAR(50) DEFAULT NULL;
  DECLARE l_newUserId INT DEFAULT NULL;

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

  START TRANSACTION;
    INSERT INTO users (userName, email, password, `type`, permissions)
    VALUES (p_userName, p_email, p_password, COALESCE(p_type, 'employee'), p_permissions);
    SET l_newUserId = LAST_INSERT_ID();

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'add_user', 'users', CAST(l_newUserId AS CHAR),
            JSON_OBJECT('userName', p_userName, 'email', p_email, 'type', p_type));
  COMMIT;

  SELECT l_newUserId AS userId;
END$$
DELIMITER ;
