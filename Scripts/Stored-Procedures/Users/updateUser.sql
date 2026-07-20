DROP procedure IF EXISTS `update_user`;
DELIMITER $$
CREATE PROCEDURE `update_user`(
  IN p_userId      INT,
  IN p_userName    VARCHAR(50),
  IN p_email       VARCHAR(100),
  IN p_type        VARCHAR(50),
  IN p_permissions JSON,
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

  START TRANSACTION;
    UPDATE users
       SET userName = COALESCE(p_userName, userName),
           email    = COALESCE(p_email, email),
           `type`   = COALESCE(p_type, `type`),
           permissions = p_permissions
     WHERE uid = p_userId;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'update_user', 'users', CAST(p_userId AS CHAR),
            JSON_OBJECT('userName', p_userName, 'email', p_email, 'type', p_type));
  COMMIT;
END$$
DELIMITER ;
